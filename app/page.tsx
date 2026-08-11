import AetherApp from "./aether-app";

export default function Page() {
  return <AetherApp authEnabled={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)} />;
}
