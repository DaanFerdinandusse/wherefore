import { redirect } from "next/navigation";

import { HOME_PATH } from "@/lib/auth/next-path";

export default function Page() {
  redirect(HOME_PATH);
}
