import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "pt" | "en";
const STORAGE_KEY = "autotechs-lang";

const dict = {
  pt: {
    "brand.tagline": "Plataforma RMM",
    "nav.dashboard": "Dashboard",
    "nav.endpoints": "Endpoints",
    "nav.tickets": "Tickets",
    "nav.automations": "Automações",
    "nav.reports": "Relatórios",
    "nav.settings": "Configurações",
    "nav.management": "Gestão",
    "nav.operations": "Operações",
    "auth.welcome": "Bem-vindo de volta",
    "auth.welcome.sub": "Acesse sua central de monitoramento",
    "auth.signup.title": "Crie sua conta",
    "auth.signup.sub": "Comece a monitorar sua infraestrutura em minutos",
    "auth.forgot.title": "Recuperar senha",
    "auth.forgot.sub": "Enviaremos um link de redefinição para seu email",
    "auth.tab.login": "Entrar",
    "auth.tab.signup": "Cadastrar",
    "auth.email": "Email",
    "auth.password": "Senha",
    "auth.password.new": "Nova senha",
    "auth.password.confirm": "Confirmar senha",
    "auth.fullName": "Nome completo",
    "auth.company": "Empresa",
    "auth.company.help": "Se a empresa já existir, você entrará como pendente até aprovação do admin",
    "auth.signIn": "Entrar",
    "auth.signUp": "Criar conta",
    "auth.forgot": "Esqueceu a senha?",
    "auth.sendReset": "Enviar link",
    "auth.back": "Voltar ao login",
    "auth.reset.title": "Defina sua nova senha",
    "auth.reset.cta": "Atualizar senha",
    "auth.reset.sent": "Verifique seu email para o link de redefinição",
    "auth.signedUp": "Conta criada! Verifique seu email para confirmar.",
    "auth.passwordsMismatch": "As senhas não coincidem",
    "auth.passwordMin": "A senha deve ter no mínimo 8 caracteres",
    "auth.invalidEmail": "Email inválido",
    "auth.required": "Campo obrigatório",
    "auth.signOut": "Sair",
    "auth.profile": "Meu perfil",
    "pending.title": "Conta aguardando aprovação",
    "pending.body": "Seu cadastro foi recebido. Um administrador da sua empresa precisa aprovar seu acesso.",
    "pending.signOut": "Sair",
    "common.loading": "Carregando...",
    "common.notifications": "Notificações",
    "common.notifications.empty": "Sem notificações por enquanto",
    "common.theme": "Tema",
    "common.language": "Idioma",
    "stub.coming": "Este módulo será implementado em seguida.",
    "role.admin": "Admin",
    "role.technician": "Técnico",
    "role.viewer": "Visualizador",
  },
  en: {
    "brand.tagline": "RMM Platform",
    "nav.dashboard": "Dashboard",
    "nav.endpoints": "Endpoints",
    "nav.tickets": "Tickets",
    "nav.automations": "Automations",
    "nav.reports": "Reports",
    "nav.settings": "Settings",
    "nav.management": "Management",
    "nav.operations": "Operations",
    "auth.welcome": "Welcome back",
    "auth.welcome.sub": "Access your monitoring command center",
    "auth.signup.title": "Create your account",
    "auth.signup.sub": "Start monitoring your infrastructure in minutes",
    "auth.forgot.title": "Recover password",
    "auth.forgot.sub": "We'll send a reset link to your email",
    "auth.tab.login": "Sign in",
    "auth.tab.signup": "Sign up",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.password.new": "New password",
    "auth.password.confirm": "Confirm password",
    "auth.fullName": "Full name",
    "auth.company": "Company",
    "auth.company.help": "If the company already exists, you'll join as pending until an admin approves",
    "auth.signIn": "Sign in",
    "auth.signUp": "Create account",
    "auth.forgot": "Forgot password?",
    "auth.sendReset": "Send link",
    "auth.back": "Back to sign in",
    "auth.reset.title": "Set your new password",
    "auth.reset.cta": "Update password",
    "auth.reset.sent": "Check your email for the reset link",
    "auth.signedUp": "Account created! Check your email to confirm.",
    "auth.passwordsMismatch": "Passwords do not match",
    "auth.passwordMin": "Password must be at least 8 characters",
    "auth.invalidEmail": "Invalid email",
    "auth.required": "Required field",
    "auth.signOut": "Sign out",
    "auth.profile": "My profile",
    "pending.title": "Account awaiting approval",
    "pending.body": "Your sign-up has been received. An administrator of your company must approve your access.",
    "pending.signOut": "Sign out",
    "common.loading": "Loading...",
    "common.notifications": "Notifications",
    "common.notifications.empty": "No notifications yet",
    "common.theme": "Theme",
    "common.language": "Language",
    "stub.coming": "This module will be built next.",
    "role.admin": "Admin",
    "role.technician": "Technician",
    "role.viewer": "Viewer",
  },
} as const;

export type TKey = keyof (typeof dict)["pt"];

const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string } | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && (localStorage.getItem(STORAGE_KEY) as Lang | null)) || "pt";
    setLangState(stored);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, l);
  };

  const t = (k: TKey) => dict[lang][k] ?? k;

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}