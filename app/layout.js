export const metadata = {
  title: "vestalife",
  description: "Conway's Game of Life, pushed to a Vestaboard.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
