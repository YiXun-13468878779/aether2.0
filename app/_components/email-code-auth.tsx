"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn, useSignUp } from "@clerk/nextjs";

type AuthStep = "email" | "code";

type ClerkFlowError = {
  code?: string;
  longMessage?: string;
  message?: string;
  errors?: Array<{
    code?: string;
    longMessage?: string;
    message?: string;
  }>;
};

function readableError(error: ClerkFlowError | null, fallback: string) {
  const detail = error?.errors?.[0] ?? error;
  if (!detail) return fallback;

  const messages: Record<string, string> = {
    form_code_incorrect: "验证码不正确，请重新输入。",
    verification_expired: "验证码已过期，请重新发送。",
    too_many_requests: "尝试次数有些多，请稍后再试。",
    form_identifier_invalid: "请检查邮箱地址是否完整。",
    session_exists: "你已经登录，正在返回 Aether。",
  };

  return messages[detail.code ?? ""] ?? detail.longMessage ?? detail.message ?? fallback;
}

export default function EmailCodeAuth() {
  const router = useRouter();
  const { signIn, fetchStatus: signInStatus } = useSignIn();
  const { signUp, fetchStatus: signUpStatus } = useSignUp();
  const [step, setStep] = useState<AuthStep>("email");
  const [emailAddress, setEmailAddress] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const busy = signInStatus === "fetching" || signUpStatus === "fetching";

  const navigateHome = ({ decorateUrl }: { decorateUrl: (url: string) => string }) => {
    const url = decorateUrl("/");
    if (url.startsWith("http")) window.location.assign(url);
    else router.replace(url);
  };

  const finalizeSignIn = async () => {
    if (!signIn) return;
    const { error } = await signIn.finalize({ navigate: navigateHome });
    if (error) setMessage(readableError(error, "登录已经完成，但返回 Aether 时遇到问题。请刷新页面。"));
  };

  const finalizeSignUp = async () => {
    if (!signUp) return;
    const { error } = await signUp.finalize({ navigate: navigateHome });
    if (error) setMessage(readableError(error, "账号已经创建，但返回 Aether 时遇到问题。请刷新页面。"));
  };

  const transferToSignUp = async () => {
    if (!signUp) return;
    const { error } = await signUp.create({ transfer: true });
    if (error) {
      setMessage(readableError(error, "邮箱验证成功，但创建入口时遇到问题。请稍后再试。"));
      return;
    }

    if (signUp.status === "complete") {
      await finalizeSignUp();
      return;
    }

    setMessage("邮箱已经验证，但当前账号配置还需要额外信息。请稍后再试。 ");
  };

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!signIn) return;

    const email = emailAddress.trim().toLowerCase();
    if (!email) {
      setMessage("先写下你的邮箱地址。");
      return;
    }

    setMessage("");
    const { error: createError } = await signIn.create({
      identifier: email,
      signUpIfMissing: true,
    });
    if (createError) {
      setMessage(readableError(createError, "暂时无法开始验证，请稍后再试。"));
      return;
    }

    const { error: sendError } = await signIn.emailCode.sendCode();
    if (sendError) {
      setMessage(readableError(sendError, "验证码没有发出，请稍后再试。"));
      return;
    }

    setEmailAddress(email);
    setStep("code");
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!signIn || !code.trim()) return;

    setMessage("");
    const { error } = await signIn.emailCode.verifyCode({ code: code.trim() });
    if (error) {
      if (error.code === "sign_up_if_missing_transfer") {
        await transferToSignUp();
        return;
      }
      setMessage(readableError(error, "验证码暂时无法确认，请重新输入。"));
      return;
    }

    if (signIn.status === "complete") {
      await finalizeSignIn();
      return;
    }

    setMessage("验证已收到，但登录还没有完成。请稍后再试。 ");
  };

  const restart = async () => {
    await signIn?.reset();
    await signUp?.reset();
    setStep("email");
    setCode("");
    setMessage("");
  };

  const resend = async () => {
    if (!signIn || busy) return;
    setMessage("");
    const { error } = await signIn.emailCode.sendCode();
    setMessage(error ? readableError(error, "验证码没有重新发出，请稍后再试。") : "新的验证码已经发出。");
  };

  return (
    <div className="email-auth-card">
      <span className="email-auth-kicker">EMAIL VERIFICATION</span>
      <h2>{step === "email" ? "回到你的创作空间" : "查收一封来自 Aether 的信"}</h2>
      <p className="email-auth-description">
        {step === "email"
          ? "输入邮箱即可继续。第一次到来时，我们会为你创建入口，不需要设置密码。"
          : <>验证码已发送至 <strong>{emailAddress}</strong>，输入邮件中的六位数字。</>}
      </p>

      {step === "email" ? (
        <form className="email-auth-form" onSubmit={sendCode}>
          <label htmlFor="auth-email">邮箱地址</label>
          <input
            id="auth-email"
            type="email"
            value={emailAddress}
            onChange={(event) => setEmailAddress(event.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            disabled={busy}
          />
          <div id="clerk-captcha" />
          <button type="submit" disabled={busy || !signIn}>
            {busy ? "正在发送…" : "发送验证码"}
          </button>
        </form>
      ) : (
        <form className="email-auth-form" onSubmit={verifyCode}>
          <label htmlFor="auth-code">验证码</label>
          <input
            id="auth-code"
            className="email-auth-code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            autoComplete="one-time-code"
            disabled={busy}
          />
          <button type="submit" disabled={busy || code.length < 6}>
            {busy ? "正在确认…" : "进入 Aether"}
          </button>
          <div className="email-auth-secondary">
            <button type="button" onClick={restart} disabled={busy}>更换邮箱</button>
            <button type="button" onClick={resend} disabled={busy}>重新发送</button>
          </div>
        </form>
      )}

      {message && <p className="email-auth-message" role="status">{message}</p>}
      <p className="email-auth-privacy">邮箱只用于身份验证，不用于营销邮件。</p>
    </div>
  );
}
