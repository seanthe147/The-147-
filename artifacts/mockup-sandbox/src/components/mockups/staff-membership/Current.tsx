// Faithful extraction of the pre-redesign staff portal membership screen.
// The iframe loads the legacy CSS and original render functions copied verbatim
// from artifacts/api-server/src/templates/staff-dashboard.html, with synthetic data only.
export function Current() {
  return <iframe title="Current staff membership screen" src="/__mockup/legacy/membership-current.html" className="min-h-screen w-full border-0" style={{ height: "100vh" }} />;
}
