export default function AdminLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Render children directly — no sidebar for login page
  return <>{children}</>;
}
