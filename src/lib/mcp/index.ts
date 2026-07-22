import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listEndpoints from "./tools/list-endpoints";
import getEndpoint from "./tools/get-endpoint";
import listClients from "./tools/list-clients";
import listTickets from "./tools/list-tickets";
import createTicket from "./tools/create-ticket";
import listAlerts from "./tools/list-alerts";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "autotechs-rmm-mcp",
  title: "Autotechs RMM",
  version: "0.1.0",
  instructions:
    "Tools to inspect and manage this Autotechs RMM tenant: list endpoints, clients, tickets and alerts, get endpoint details, and create support tickets. All calls are scoped to the signed-in user's tenant via RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listEndpoints, getEndpoint, listClients, listTickets, createTicket, listAlerts],
});