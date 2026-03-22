import PDFDocument from "pdfkit";
import fs from "fs";

const doc = new PDFDocument({ margin: 60, size: "A4" });
const stream = fs.createWriteStream("google-ads-api-design-doc.pdf");
doc.pipe(stream);

const blue = "#1a73e8";
const dark = "#202124";
const gray = "#5f6368";

// Title
doc.fontSize(22).fillColor(blue).text("Google Ads API — Design Document", { align: "center" });
doc.moveDown(0.3);
doc.fontSize(12).fillColor(gray).text("Mangaba Urbanismo — Internal Marketing Dashboard", { align: "center" });
doc.moveDown(0.3);
doc.fontSize(10).text("Date: March 2026 | Version: 1.0", { align: "center" });
doc.moveDown(1.5);

// Line
doc.strokeColor("#dadce0").lineWidth(1).moveTo(60, doc.y).lineTo(535, doc.y).stroke();
doc.moveDown(1);

// Section helper
function section(title) {
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor(blue).text(title);
  doc.moveDown(0.3);
}

function body(text) {
  doc.fontSize(10).fillColor(dark).text(text, { lineGap: 4 });
  doc.moveDown(0.5);
}

function bullet(text) {
  doc.fontSize(10).fillColor(dark).text(`  •  ${text}`, { lineGap: 3 });
}

// Content
section("1. Company Overview");
body("Mangaba Urbanismo is a real estate development company based in Cuiaba, Mato Grosso, Brazil. The company develops residential condominiums and uses digital advertising (Google Ads, Meta Ads) to generate qualified leads for property sales. The current project, \"Cenario dos Lagos\", is a residential development launching in March 2026.");

section("2. Purpose of the Tool");
body("We are building a private, internal marketing dashboard to consolidate and visualize campaign performance data from Google Ads. The dashboard is used exclusively by the marketing and sales teams at Mangaba Urbanismo to:");
bullet("Monitor real-time campaign performance (impressions, clicks, cost, conversions)");
bullet("Calculate key performance indicators: CPL, CAC, ROI, and VSO");
bullet("Compare channel effectiveness across multiple advertising platforms");
bullet("Optimize advertising budget allocation based on data-driven insights");
doc.moveDown(0.5);

section("3. Technical Architecture");
body("The tool is a web application built with the following stack:");
bullet("Frontend: Next.js 16 (React 19) with TypeScript and Tailwind CSS");
bullet("Charts: Recharts library for data visualization");
bullet("Hosting: Vercel (serverless deployment)");
bullet("Data Storage: Vercel Blob for persistent metric storage");
bullet("Authentication: OAuth 2.0 with refresh token for Google Ads API");
doc.moveDown(0.5);

section("4. Google Ads API Usage");
body("The tool uses the Google Ads API v17 in a read-only capacity:");
bullet("Method: GoogleAds.SearchStream");
bullet("Resources accessed: campaign, metrics");
bullet("Fields: campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions");
bullet("Frequency: On-demand when user accesses the dashboard (not automated polling)");
bullet("Scope: Only our own Google Ads account (Customer ID: 171-613-6766)");
bullet("MCC Account: 649-114-5054");
doc.moveDown(0.5);

section("5. Data Flow");
body("1. User opens the dashboard in their web browser.\n2. Frontend calls the /api/google-ads serverless endpoint.\n3. The endpoint uses a stored refresh token to obtain a short-lived access token via OAuth 2.0.\n4. The endpoint queries Google Ads API SearchStream with a GAQL query for campaign metrics.\n5. The response is formatted and returned to the frontend as JSON.\n6. The frontend renders the data as KPI cards and interactive charts.\n7. No campaign data is permanently stored — it is fetched and displayed in real-time.");

section("6. Access Control");
bullet("The tool is for INTERNAL USE ONLY — employees of Mangaba Urbanismo");
bullet("The tool does NOT modify any Google Ads data (read-only access)");
bullet("The tool does NOT provide access to third-party Google Ads accounts");
bullet("The tool is NOT a commercial product and will NOT be sold or distributed");
bullet("OAuth credentials and tokens are stored securely as environment variables on Vercel");
doc.moveDown(0.5);

section("7. Rate Limiting & Compliance");
bullet("API calls are made only when a user views the dashboard (no background polling)");
bullet("Estimated daily API calls: fewer than 50");
bullet("The tool complies with Google Ads API Terms of Service");
bullet("The tool complies with Google Ads API Required Minimum Functionality (RMF)");
bullet("No data is shared with third parties");
doc.moveDown(0.5);

section("8. Contact Information");
body("Company: Mangaba Urbanismo\nContact: Felipe Callejas\nEmail: felipe@mangabaurbanismo.com.br\nMCC Account: 649-114-5054\nGoogle Ads Customer ID: 171-613-6766");

doc.end();

stream.on("finish", () => {
  console.log("PDF generated: google-ads-api-design-doc.pdf");
});
