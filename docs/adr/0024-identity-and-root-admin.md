# Identity and root admin

Status: accepted

On 2026-11-22 the owner decided how Accounts and the root admin come into Graveshift.

The root admin comes only from four `.env` keys: `GRAVESHIFT_ROOT_ADMIN_EMAIL`, `GRAVESHIFT_ROOT_ADMIN_PASSWORD`, `GRAVESHIFT_ROOT_ORG_NAME` and `GRAVESHIFT_ROOT_ORG_SLUG`. No other source creates a root admin. No in-product action raises an Account to root admin.

First boot seeds only three records: one Account, one Organization and one Membership that makes that Account the owner of that Organization. The implementation will run this seed on first boot only.

Users register themselves. A registered Account cannot register as admin. A registered Account creates its own Organization through onboarding. One Account may belong to many Organizations. Each Membership carries one Role, owner or member.

The trade-off is no self-service admin promotion. In return, the root admin has one traceable source in the deployment environment, and every other Account starts from the same registration path.
