/** Remounts on each navigation, so the page fades in. The animation is off under prefers-reduced-motion. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
