/* =====================================================================
   CLEANSCOUT site settings. Safe to publish: nothing here is a secret.

   STRIPE
   Paste a Stripe Payment Link for each plan and the site sends new
   signups to Stripe to start their free trial. Leave them empty and
   billing stays a simulation. Setup steps are in README.md.
     solo / growth / pro   https://buy.stripe.com/...
     portal                https://billing.stripe.com/p/login/...   (customer portal login link)
   ===================================================================== */
window.CLEANSCOUT_CONFIG = {
  stripe: { solo: '', growth: '', pro: '', portal: '' }
};
