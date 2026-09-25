import { TabPage } from "@social/components/TabPage";
import { SLOT_FEED } from "@social/lib/contracts";

/** Every community's posts, ranked. */
export default function Popular() {
  return (
    <TabPage slot={SLOT_FEED} source="popular" blurb="From every community, ranked by the contract you choose." />
  );
}
