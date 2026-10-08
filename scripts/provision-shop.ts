import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load ignored local env files for a deliberate, operator-run one-time command.
dotenv.config({ path: ".env.local" });
dotenv.config();

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const shopName = argument("--name")?.trim();
const managerUserId = argument("--manager-user-id")?.trim();
const confirmation = process.argv.includes("--confirm-one-time-provisioning");
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!confirmation) {
  console.error("Refusing to create a shop without --confirm-one-time-provisioning.");
  process.exit(2);
}
if (!shopName || !managerUserId || !supabaseUrl || !serviceRoleKey) {
  console.error("Required: --name, --manager-user-id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server-side only).");
  process.exit(2);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(managerUserId)) {
  console.error("--manager-user-id must be the UUID of a user already created in Supabase Auth.");
  process.exit(2);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const { data, error } = await supabase.rpc("provision_shop", {
  p_name: shopName,
  p_manager_user_id: managerUserId,
});
if (error) {
  console.error(`Provisioning failed: ${error.message}`);
  process.exit(1);
}
console.log(`Shop provisioned successfully. shop_id=${data}`);
