import Link from "next/link";
import EmailCodeAuth from "./email-code-auth";

export default function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" }) {
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main className="auth-screen" data-auth-mode={mode}>
      <div className="auth-backdrop" />
      <header className="auth-nav"><Link href="/">AETHER</Link><span>灵魂对话</span></header>
      <section className="auth-stage">
        <div className="auth-intro"><span>ENTER AETHER</span><h1>先留下一个可以归来的入口。</h1><p>使用邮箱完成验证。你的对话与作品仍只保存在当前设备，Aether 不会把账号当作定义你的标签。</p></div>
        {authEnabled ? (
          <EmailCodeAuth />
        ) : (
          <div className="auth-config-note"><strong>登录服务正在连接</strong><p>Clerk 环境变量尚未进入当前环境，请在部署完成后重试。</p><Link href="/">返回首页</Link></div>
        )}
      </section>
      <footer className="auth-footer"><span>邮箱仅用于登录验证</span><span>© 2026 Aether</span></footer>
    </main>
  );
}
