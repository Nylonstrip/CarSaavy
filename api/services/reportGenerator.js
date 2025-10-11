// api/services/reportGenerator.js
// Generates HTML reports from vehicle data

function generateHTMLReport(vehicleData) {
    const { vin, specs, recalls, history, pricing, repairs } = vehicleData;
    
    // Helper function to format currency
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    };
    
    // Helper function to get status color
    const getStatusColor = (isGood) => isGood ? '#00d924' : '#ff4444';
    
    const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Vehicle Report - ${vin}</title>
      <style>
          * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
          }
          
          body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background: #f5f7fa;
              padding: 20px;
          }
          
          .container {
              max-width: 900px;
              margin: 0 auto;
              background: white;
              border-radius: 12px;
              box-shadow: 0 2px 12px rgba(0,0,0,0.1);
              overflow: hidden;
          }
          
          .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px;
              text-align: center;
          }
          
          .header h1 {
              font-size: 32px;
              margin-bottom: 10px;
          }
          
          .vin-badge {
              background: rgba(255,255,255,0.2);
              padding: 10px 20px;
              border-radius: 8px;
              display: inline-block;
              font-family: 'Courier New', monospace;
              font-size: 18px;
              letter-spacing: 2px;
              margin-top: 10px;
          }
          
          .content {
              padding: 40px;
          }
          
          .section {
              margin-bottom: 40px;
          }
          
          .section-title {
              font-size: 24px;
              color: #1a1a1a;
              margin-bottom: 20px;
              padding-bottom: 10px;
              border-bottom: 3px solid #667eea;
          }
          
          .info-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 20px;
              margin-bottom: 20px;
          }
          
          .info-item {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 8px;
          }
          
          .info-label {
              font-size: 12px;
              color: #666;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 5px;
          }
          
          .info-value {
              font-size: 18px;
              color: #1a1a1a;
              font-weight: 600;
          }
          
          .pricing-card {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              border-radius: 12px;
              text-align: center;
              margin: 20px 0;
          }
          
          .pricing-amount {
              font-size: 48px;
              font-weight: 700;
              margin: 10px 0;
          }
          
          .pricing-range {
              font-size: 16px;
              opacity: 0.9;
          }
          
          .recommendation-box {
              background: #e7f3ff;
              border-left: 4px solid #2196F3;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
          }
          
          .recommendation-title {
              font-size: 18px;
              font-weight: 600;
              color: #1565C0;
              margin-bottom: 10px;
          }
          
          .alert-box {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
          }
          
          .alert-box.danger {
              background: #f8d7da;
              border-left-color: #dc3545;
          }
          
          .alert-box.success {
              background: #d4edda;
              border-left-color: #28a745;
          }
          
          .recall-item {
              background: #fff;
              border: 1px solid #dee2e6;
              padding: 20px;
              border-radius: 8px;
              margin-bottom: 15px;
          }
          
          .recall-component {
              font-weight: 600;
              color: #dc3545;
              margin-bottom: 10px;
          }
          
          .status-badge {
              display: inline-block;
              padding: 5px 15px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: 600;
          }
          
          .status-good {
              background: #d4edda;
              color: #155724;
          }
          
          .status-warning {
              background: #fff3cd;
              color: #856404;
          }
          
          .status-bad {
              background: #f8d7da;
              color: #721c24;
          }
          
          .negotiation-tips {
              background: #f8f9fa;
              padding: 25px;
              border-radius: 8px;
              margin-top: 20px;
          }
          
          .tip-item {
              padding: 15px 0;
              border-bottom: 1px solid #dee2e6;
          }
          
          .tip-item:last-child {
              border-bottom: none;
          }
          
          .tip-number {
              display: inline-block;
              width: 30px;
              height: 30px;
              background: #667eea;
              color: white;
              border-radius: 50%;
              text-align: center;
              line-height: 30px;
              font-weight: 600;
              margin-right: 10px;
          }
          
          .footer {
              background: #f8f9fa;
              padding: 30px 40px;
              text-align: center;
              color: #666;
              font-size: 14px;
          }
          
          @media print {
              body {
                  background: white;
                  padding: 0;
              }
              .container {
                  box-shadow: none;
              }
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <h1>🚗 Vehicle Audit Report</h1>
              <p>Comprehensive analysis and negotiation guide</p>
              <div class="vin-badge">${vin}</div>
          </div>
          
          <div class="content">
              <!-- Vehicle Specifications -->
              <div class="section">
                  <h2 class="section-title">📋 Vehicle Specifications</h2>
                  ${specs.success ? `
                  <div class="info-grid">
                      <div class="info-item">
                          <div class="info-label">Year</div>
                          <div class="info-value">${specs.data.year}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Make</div>
                          <div class="info-value">${specs.data.make}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Model</div>
                          <div class="info-value">${specs.data.model}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Body Type</div>
                          <div class="info-value">${specs.data.bodyType || 'N/A'}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Engine</div>
                          <div class="info-value">${specs.data.engine || 'N/A'}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Transmission</div>
                          <div class="info-value">${specs.data.transmission || 'N/A'}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Drive Type</div>
                          <div class="info-value">${specs.data.driveType || 'N/A'}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Fuel Type</div>
                          <div class="info-value">${specs.data.fuelType || 'N/A'}</div>
                      </div>
                  </div>
                  ` : '<p>Unable to fetch vehicle specifications.</p>'}
              </div>
              
              <!-- Market Pricing -->
              <div class="section">
                  <h2 class="section-title">💰 Market Pricing Analysis</h2>
                  ${pricing.success ? `
                  <div class="pricing-card">
                      <div>Estimated Market Value</div>
                      <div class="pricing-amount">${formatCurrency(pricing.data.estimatedValue)}</div>
                      <div class="pricing-range">
                          Range: ${formatCurrency(pricing.data.priceRange.low)} - ${formatCurrency(pricing.data.priceRange.high)}
                      </div>
                  </div>
                  
                  <div class="info-grid">
                      <div class="info-item">
                          <div class="info-label">Dealer Retail</div>
                          <div class="info-value">${formatCurrency(pricing.data.dealerRetail)}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Private Sale</div>
                          <div class="info-value">${formatCurrency(pricing.data.privateSale)}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Trade-In Value</div>
                          <div class="info-value">${formatCurrency(pricing.data.tradeIn)}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Market Condition</div>
                          <div class="info-value">${pricing.data.marketCondition}</div>
                      </div>
                  </div>
                  
                  <div class="recommendation-box">
                      <div class="recommendation-title">💡 Recommended Opening Offer</div>
                      <p style="font-size: 24px; font-weight: 600; color: #1565C0; margin: 10px 0;">
                          ${formatCurrency(pricing.data.recommendedOffer)}
                      </p>
                      <p>Start negotiations 10% below market value. This gives you room to negotiate while remaining realistic.</p>
                  </div>
                  ${pricing.note ? `<p style="color: #666; font-size: 14px; font-style: italic;">${pricing.note}</p>` : ''}
                  ` : '<p>Unable to fetch pricing data.</p>'}
              </div>
              
              <!-- Recalls -->
              <div class="section">
                  <h2 class="section-title">⚠️ Safety Recalls</h2>
                  ${recalls.success ? `
                      ${recalls.data.totalRecalls === 0 ? `
                      <div class="alert-box success">
                          <strong>✅ No Active Recalls</strong>
                          <p>This vehicle has no outstanding safety recalls on record.</p>
                      </div>
                      ` : `
                      <div class="alert-box danger">
                          <strong>⚠️ ${recalls.data.totalRecalls} Active Recall${recalls.data.totalRecalls > 1 ? 's' : ''}</strong>
                          <p>This vehicle has outstanding safety recalls that should be addressed.</p>
                      </div>
                      ${recalls.data.recalls.map(recall => `
                      <div class="recall-item">
                          <div class="recall-component">${recall.component}</div>
                          <p><strong>Issue:</strong> ${recall.summary}</p>
                          <p><strong>Consequence:</strong> ${recall.consequence}</p>
                          <p><strong>Remedy:</strong> ${recall.remedy}</p>
                          <p style="color: #666; font-size: 14px; margin-top: 10px;">
                              Reported: ${new Date(recall.date).toLocaleDateString()}
                          </p>
                      </div>
                      `).join('')}
                      <div class="recommendation-box">
                          <div class="recommendation-title">💡 Negotiation Point</div>
                          <p>Use these recalls as leverage. Ask the dealer to complete all recall repairs before purchase, or negotiate a price reduction of $200-$500 per outstanding recall.</p>
                      </div>
                      `}
                  ` : '<p>Unable to fetch recall data.</p>'}
              </div>
              
              <!-- Vehicle History -->
              <div class="section">
                  <h2 class="section-title">📜 Vehicle History</h2>
                  ${history.success ? `
                  <div class="info-grid">
                      <div class="info-item">
                          <div class="info-label">Title Status</div>
                          <div class="info-value">
                              <span class="status-badge ${history.data.titleInfo.clean ? 'status-good' : 'status-bad'}">
                                  ${history.data.titleInfo.clean ? 'Clean Title' : 'Problem Title'}
                              </span>
                          </div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Accident History</div>
                          <div class="info-value">
                              <span class="status-badge ${!history.data.accidentHistory.reported ? 'status-good' : 'status-warning'}">
                                  ${history.data.accidentHistory.reported ? 
                                      `${history.data.accidentHistory.count} Reported` : 
                                      'None Reported'}
                              </span>
                          </div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Number of Owners</div>
                          <div class="info-value">${history.data.ownershipHistory.numberOfOwners}</div>
                      </div>
                      <div class="info-item">
                          <div class="info-label">Previous Use</div>
                          <div class="info-value">
                              ${history.data.ownershipHistory.personalUse ? 'Personal' : 
                                history.data.ownershipHistory.rental ? 'Rental' :
                                history.data.ownershipHistory.lease ? 'Lease' : 'Unknown'}
                          </div>
                      </div>
                  </div>
                  ${history.note ? `<p style="color: #666; font-size: 14px; font-style: italic; margin-top: 15px;">${history.note}</p>` : ''}
                  ` : '<p>Unable to fetch vehicle history.</p>'}
              </div>
              
              <!-- Repair Costs -->
              <div class="section">
                  <h2 class="section-title">🔧 Estimated Ownership Costs</h2>
                  ${repairs.success ? `
                  <div class="alert-box">
                      <strong>Annual Maintenance Estimate: ${formatCurrency(repairs.data.annualMaintenanceCost.estimated)}</strong>
                      <p>Range: ${formatCurrency(repairs.data.annualMaintenanceCost.range.min)} - ${formatCurrency(repairs.data.annualMaintenanceCost.range.max)}</p>
                  </div>
                  
                  <h3 style="margin: 20px 0 15px 0; font-size: 18px;">Common Maintenance Items:</h3>
                  ${repairs.data.commonIssues.map(issue => `
                  <div class="info-item" style="margin-bottom: 15px;">
                      <div style="font-weight: 600; margin-bottom: 5px;">${issue.issue}</div>
                      <div style="color: #666;">
                          Cost: ${formatCurrency(issue.estimatedCost.min)} - ${formatCurrency(issue.estimatedCost.max)}
                      </div>
                      <div style="color: #666; font-size: 14px;">${issue.frequency}</div>
                  </div>
                  `).join('')}
                  
                  <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                      <strong>Reliability Score: ${repairs.data.reliabilityScore}/10</strong>
                  </div>
                  ${repairs.note ? `<p style="color: #666; font-size: 14px; font-style: italic; margin-top: 15px;">${repairs.note}</p>` : ''}
                  ` : '<p>Unable to fetch repair estimates.</p>'}
              </div>
              
              <!-- Negotiation Guide -->
              <div class="section">
                  <h2 class="section-title">🎯 Negotiation Strategy</h2>
                  <div class="negotiation-tips">
                      <div class="tip-item">
                          <span class="tip-number">1</span>
                          <strong>Start Below Market Value:</strong> Open with ${pricing.success ? formatCurrency(pricing.data.recommendedOffer) : 'an offer 10% below asking price'}. This gives you negotiating room.
                      </div>
                      <div class="tip-item">
                          <span class="tip-number">2</span>
                          <strong>Use Recalls as Leverage:</strong> ${recalls.success && recalls.data.totalRecalls > 0 ? 
                              `Point out the ${recalls.data.totalRecalls} outstanding recall${recalls.data.totalRecalls > 1 ? 's' : ''} and request completion or price reduction.` :
                              'No recalls to leverage, but still inspect the vehicle thoroughly.'}
                      </div>
                      <div class="tip-item">
                          <span class="tip-number">3</span>
                          <strong>Know Your Walk-Away Price:</strong> Set a maximum of ${pricing.success ? formatCurrency(pricing.data.priceRange.high) : 'market value'} and stick to it.
                      </div>
                      <div class="tip-item">
                          <span class="tip-number">4</span>
                          <strong>Request Pre-Purchase Inspection:</strong> Always get an independent mechanic inspection before finalizing.
                      </div>
                      <div class="tip-item">
                          <span class="tip-number">5</span>
                          <strong>Consider Total Ownership Cost:</strong> Factor in the estimated ${repairs.success ? formatCurrency(repairs.data.annualMaintenanceCost.estimated) : '$1,200'} annual maintenance when budgeting.
                      </div>
                  </div>
              </div>
          </div>
          
          <div class="footer">
              <p><strong>Report Generated:</strong> ${new Date(vehicleData.generatedAt).toLocaleString()}</p>
              <p style="margin-top: 10px;">This report is for informational purposes only. Always perform a professional inspection before purchase.</p>
          </div>
      </div>
  </body>
  </html>
    `;
    
    return html;
  }
  
  module.exports = { generateHTMLReport };