import { TabPage } from "@social/components/TabPage";
import { SLOT_FEED } from "@social/lib/contracts";

/** Home: the communities you joined, the way Reddit's front page is. */
export default function Home() {
  return <TabPage slot={SLOT_FEED} source="joined" />;
}
