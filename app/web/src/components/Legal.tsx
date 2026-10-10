/** Copyright line shown on every screen (and on printed reports). */
export function Legal({ className = "" }: { className?: string }) {
  return (
    <footer className={"legal " + className}>
      <span>© {new Date().getFullYear()} <a href="https://hellens.dev" target="_blank" rel="noopener noreferrer">hellens.dev</a></span>
      <span aria-hidden="true">·</span><span>HAN Task Tracker</span>
    </footer>
  );
}
