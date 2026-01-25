// api/ops.js
// Consolidated ops endpoint:
// - action=list      → list orders bucketed by status
// - action=update    → update status (queued/working/delivered/cancelled)
// - action=fulfill   → send manual report via Resend + mark delivered

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// --- SUPABASE ENV ---
const supabaseUrl = process.env.SUPABASE_URL; // or SUPABASE_URL depending on your choice
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // must match your env var

if (!supabaseUrl || !supabaseKey) {
  throw new Error('[OPS] Missing Supabase env vars');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- RESEND ENV ---
const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  throw new Error('[OPS] Missing RESEND_API_KEY');
}
const resend = new Resend(resendApiKey);

// --- OPS PASSWORD ---
const opsPasswordEnvRaw = process.env.OPS_PASSWORD;
if (!opsPasswordEnvRaw) {
  throw new Error('[OPS] Missing OPS_PASSWORD');
}

// normalize once
const opsPasswordEnv = opsPasswordEnvRaw.trim();

// small helper: parse body safely
function getBody(req) {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

// helper: greetings name = fullName or email local-part or "there"
function deriveDisplayName(fullName, email) {
  if (fullName && fullName.trim().length > 0) return fullName.trim();
  if (email && email.includes('@')) return email.split('@')[0];
  return 'there';
}

// sort helpers for buckets
function sortQueuedOrWorking(arr) {
  return arr.sort((a, b) => {
    const ad = a.sla_deadline ? new Date(a.sla_deadline).getTime() : Infinity;
    const bd = b.sla_deadline ? new Date(b.sla_deadline).getTime() : Infinity;
    return ad - bd;
  });
}

function sortDelivered(arr) {
  return arr.sort((a, b) => {
    const ad = a.delivered_at ? new Date(a.delivered_at).getTime() : 0;
    const bd = b.delivered_at ? new Date(b.delivered_at).getTime() : 0;
    return bd - ad; // newest first
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = getBody(req);
    const { action, opsPassword } = body;

    // normalize what came from the browser too
    const incomingPassword = (opsPassword || '').trim();

    if (!incomingPassword || incomingPassword !== opsPasswordEnv) {
    // TEMP: if you want, add a debug log just once while testing
    // console.log('[OPS] auth mismatch', {
    //   incomingPassword,
    //   incomingLen: incomingPassword.length,
    //   envLen: opsPasswordEnv.length,
    // });
    res.status(401).json({ error: 'Unauthorized' });
    return;
    }

    if (!action) {
      res.status(400).json({ error: 'Missing action' });
      return;
    }

    // -----------------------
    // ACTION: LIST
    // -----------------------
    if (action === 'list') {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id,
          sku,
          tier,
          sla_hours,
          email,
          phone,
          status,
          created_at,
          sla_deadline,
          delivered_at
        `
        )
        .order('created_at', { ascending: true });

      if (error) throw error;

      const buckets = {
        queued: [],
        working: [],
        delivered: [],
        cancelled: [],
      };

      for (const row of data || []) {
        const status = row.status || 'queued';
        if (status === 'working') {
          buckets.working.push(row);
        } else if (status === 'delivered') {
          buckets.delivered.push(row);
        } else if (status === 'cancelled') {
          buckets.cancelled.push(row);
        } else {
          buckets.queued.push(row);
        }
      }

      buckets.queued = sortQueuedOrWorking(buckets.queued);
      buckets.working = sortQueuedOrWorking(buckets.working);
      buckets.delivered = sortDelivered(buckets.delivered);

      res.status(200).json(buckets);
      return;
    }

    // -----------------------
    // ACTION: UPDATE STATUS
    // -----------------------
    if (action === 'update') {
        const { id, status } = body;
      
        if (!id || !status) {
          return res.status(400).json({ error: 'Missing id or status' });
        }
      
        const allowed = ['queued', 'working', 'delivered', 'cancelled'];
        if (!allowed.includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
      
        const updatePatch = { status };
      
        if (status === 'working') {
          updatePatch.started_at = new Date().toISOString();
        }
      
        if (status === 'delivered') {
          updatePatch.delivered_at = new Date().toISOString();
        }
      
        const { data, error } = await supabase
          .from('orders')
          .update(updatePatch)
          .eq('id', id)
          .select()
          .single();
      
        if (error) throw error;
      
        return res.status(200).json({ ok: true, order: data });
      }

    // -----------------------
    // ACTION: FULFILL MANUAL
    // -----------------------
    if (action === 'fulfill') {
      const {
        sku,
        fullName,
        email,
        tier,
        slaHours,
        mode,
        pdf,
        html,
      } = body;

      if (!sku || !email || !tier || !slaHours || !pdf || !html) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }


      // Find latest order by SKU (in case duplicates exist)
      const { data: orderRow, error: findErr } = await supabase
        .from('orders')
        .select(
          `
          id,
          sku,
          tier,
          sla_hours,
          email,
          status,
          created_at,
          sla_deadline
        `
        )
        .eq('sku', sku)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (findErr) {
        console.warn('[OPS] fulfill: order lookup error', findErr.message);
      }

      const displayName = deriveDisplayName(fullName, email);
      const safeTier =
        tier === 'comprehensive' || tier === 'essential'
          ? tier
          : orderRow?.tier || tier;
      const safeSla = Number(slaHours) || orderRow?.sla_hours || 48;

      const subject = `Your CarSaavy report — ${sku}`;
      const tierLabel =
        safeTier === 'comprehensive' ? 'Comprehensive (48h)' : 'Essential (48h)';

      const bullets = `
        <ul>
          <li>Market & fair value positioning for your specific vehicle</li>
          <li>Dealer pushback scripts you can reuse word-for-word</li>
          <li>Context-aware purchase guidance and walk-away triggers</li>
          <li>Risk factors & avoidable costs tailored to your deal</li>
        </ul>
      `;

      let htmlBody;
      if (mode === 'branded') {
        htmlBody = `
          <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#0f172a;">
            <h2 style="margin-bottom:4px;">Your CarSaavy report is ready</h2>
            <p style="margin-top:0;color:#4b5563;">Order ${sku}</p>

            <p>Hi ${displayName},</p>

            <p>
              Your <strong>${tierLabel}</strong> vehicle intelligence report is attached as a PDF.
              We’ve also included an HTML copy you can open in your browser.
            </p>

            <h3 style="margin-top:24px;margin-bottom:8px;">What’s inside</h3>
            ${bullets}

            <p style="margin-top:24px;">
              If you have questions or want a second set of eyes on the deal before you sign,
              just reply directly to this email.
            </p>

            <p style="margin-top:24px;">
              Good luck — you’re prepared.<br/>
              <strong>CarSaavy</strong>
            </p>
          </div>
        `;
      } else {
        // short mode
        htmlBody = `
          <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#0f172a;">
            <p>Hi ${displayName},</p>
            <p>Your CarSaavy report (<strong>${tierLabel}</strong>) for order <strong>${sku}</strong> is attached.</p>
            <p>You’ll find a PDF copy plus an HTML version you can open in your browser.</p>
            <p>If you have any questions about the deal, just reply to this email.</p>
            <p>Good luck — you’re prepared.<br/><strong>CarSaavy</strong></p>
          </div>
        `;
      }

      // Prepare attachments for Resend (both base64)
      const pdfAttachment = {
        filename: pdf.filename || `${sku}.pdf`,
        content: pdf.base64,
        contentType: 'application/pdf',
      };

      const htmlBase64 = Buffer.from(html.content || '', 'utf8').toString(
        'base64'
      );
      const htmlAttachment = {
        filename: html.filename || `${sku}.html`,
        content: htmlBase64,
        contentType: 'text/html',
      };

      const sendResult = await resend.emails.send({
        from: 'CarSaavy Reports <reports@carsaavy.com>',
        to: email,
        subject,
        html: htmlBody,
        attachments: [pdfAttachment, htmlAttachment],
      });

      if (orderRow.status !== "working") {
        return res.status(400).json({ error: "Order must be moved to 'working' before fulfilling" });
      }

      // Update DB: mark delivered + log email meta if we have an order row
      if (orderRow && orderRow.id) {
        const sentMeta = {
          subject,
          to: email,
          mode: mode === 'branded' ? 'branded' : 'short',
          at: new Date().toISOString(),
          resendId: sendResult?.data?.id || null,
        };
        
        const { error: updErr } = await supabase
          .from('orders')
          .update({
            status: 'delivered',
            delivered_at: sentMeta.at,
            sent_email: sentMeta,
          })
          .eq('id', orderRow.id);

        if (updErr) {
          console.warn('[OPS] fulfill: update orders error', updErr.message);
        }
      }

      res.status(200).json({
        ok: true,
        message: 'Email sent',
        resendId: sendResult?.data?.id || null,
      });
      return;
    }

    // -----------------------
    // ACTION: START BY SKU
    // -----------------------
    if (action === 'start-by-sku') {
        const { sku } = body;
        if (!sku) {
        return res.status(400).json({ error: 'Missing sku' });
        }
    
        // Update latest order with that SKU
        const now = new Date().toISOString();
    
        const { data, error } = await supabase
        .from('orders')
        .update({
            status: 'working',
            started_at: now
        })
        .eq('sku', sku)
        .order('created_at', { ascending: false })
        .limit(1)
        .select()
        .single();
    
        if (error) {
        console.error('[OPS] start-by-sku error:', error);
        return res.status(500).json({ error: 'DB update error' });
        }
    
        return res.status(200).json({ ok: true, order: data });
    }


    // -----------------------
    // UNKNOWN ACTION
    // -----------------------
    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[OPS] handler error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};