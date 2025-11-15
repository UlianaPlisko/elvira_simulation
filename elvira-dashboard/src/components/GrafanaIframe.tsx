export default function GrafanaIframe() {
  return (
    <iframe
      src="http://localhost:3000/d/your-dashboard-id?orgId=1&refresh=5s"
      width="100%"
      height="400"
      frameBorder="0"
    />
  );
}