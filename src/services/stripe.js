/**
 * Hope Basketball Agent — Stripe Service
 * Gestion des paiements, sessions Checkout, webhooks
 * et remboursements pour les inscriptions aux camps.
 * 
 * Intégré avec WooCommerce pour la mise à jour des commandes.
 */

import Stripe from 'stripe';

export class StripeService {
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
    });
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  }

  // ──────────────────────────────────────────────
  // CHECKOUT — Créer des sessions de paiement
  // ──────────────────────────────────────────────

  /**
   * Crée une session Stripe Checkout pour un camp
   * @param {Object} params - Paramètres de la session
   * @returns {Object} URL de paiement
   */
  async createCheckoutSession(params) {
    try {
      const {
        order_id,
        camp_name,
        price,
        quantity = 1,
        customer_email,
        customer_name,
        child_name,
        success_url,
        cancel_url,
      } = params;

      const baseUrl = process.env.WOO_URL || 'https://hopebasketballquebec.com';

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: customer_email,
        locale: 'fr-CA',
        line_items: [
          {
            price_data: {
              currency: 'cad',
              product_data: {
                name: camp_name,
                description: child_name
                  ? `Inscription de ${child_name}`
                  : 'Inscription camp Hope Basketball',
                metadata: {
                  order_id: String(order_id),
                  child_name: child_name || '',
                },
              },
              unit_amount: Math.round(parseFloat(price) * 100), // En cents
            },
            quantity: quantity,
          },
        ],
        // Taxes QC (TPS 5% + TVQ 9.975%)
        automatic_tax: { enabled: false }, // On gère manuellement via WooCommerce
        metadata: {
          order_id: String(order_id),
          source: 'hope-basketball-agent',
          customer_name: customer_name || '',
          child_name: child_name || '',
        },
        success_url:
          success_url ||
          `${baseUrl}/inscription-confirmee/?order_id=${order_id}`,
        cancel_url:
          cancel_url ||
          `${baseUrl}/inscription-annulee/?order_id=${order_id}`,
      });

      return {
        success: true,
        checkout_url: session.url,
        session_id: session.id,
        order_id: order_id,
      };
    } catch (error) {
      console.error('[Stripe] Erreur createCheckoutSession:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ──────────────────────────────────────────────
  // LIENS DE PAIEMENT — Pour partage via chat
  // ──────────────────────────────────────────────

  /**
   * Crée un lien de paiement Stripe réutilisable
   * @param {Object} params
   * @returns {Object} Lien de paiement
   */
  async createPaymentLink(params) {
    try {
      const { camp_name, price, order_id, child_name } = params;

      // Créer le produit et le prix Stripe
      const product = await this.stripe.products.create({
        name: camp_name,
        description: child_name
          ? `Inscription de ${child_name} — ${camp_name}`
          : `Inscription — ${camp_name}`,
        metadata: {
          order_id: String(order_id),
          source: 'hope-basketball-agent',
        },
      });

      const stripePrice = await this.stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(parseFloat(price) * 100),
        currency: 'cad',
      });

      const paymentLink = await this.stripe.paymentLinks.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        metadata: {
          order_id: String(order_id),
          child_name: child_name || '',
        },
        after_completion: {
          type: 'redirect',
          redirect: {
            url: `${process.env.WOO_URL || 'https://hopebasketballquebec.com'}/inscription-confirmee/?order_id=${order_id}`,
          },
        },
      });

      return {
        success: true,
        payment_url: paymentLink.url,
        link_id: paymentLink.id,
        order_id: order_id,
      };
    } catch (error) {
      console.error('[Stripe] Erreur createPaymentLink:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ──────────────────────────────────────────────
  // WEBHOOKS — Traitement des événements Stripe
  // ──────────────────────────────────────────────

  /**
   * Vérifie et parse un événement webhook Stripe
   * @param {Buffer} rawBody - Corps brut de la requête
   * @param {string} signature - Header stripe-signature
   * @returns {Object} Événement vérifié
   */
  verifyWebhook(rawBody, signature) {
    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret
      );
      return { success: true, event };
    } catch (error) {
      console.error('[Stripe] Erreur webhook:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Traite un événement webhook
   * @param {Object} event - Événement Stripe vérifié
   * @param {Object} wooService - Instance WooCommerceService
   * @returns {Object} Résultat du traitement
   */
  async handleWebhookEvent(event, wooService) {
    const { type, data } = event;

    switch (type) {
      case 'checkout.session.completed': {
        const session = data.object;
        const orderId = session.metadata?.order_id;

        if (orderId && wooService) {
          try {
            // Mettre à jour la commande WooCommerce en "processing"
            await wooService.api.put(`orders/${orderId}`, {
              status: 'processing',
              meta_data: [
                {
                  key: 'stripe_session_id',
                  value: session.id,
                },
                {
                  key: 'stripe_payment_intent',
                  value: session.payment_intent,
                },
              ],
            });
            console.log(
              `[Stripe] Commande #${orderId} mise à jour → processing`
            );
            return { success: true, action: 'order_updated', order_id: orderId };
          } catch (err) {
            console.error(
              `[Stripe] Erreur mise à jour commande #${orderId}:`,
              err.message
            );
            return { success: false, error: err.message };
          }
        }
        return { success: true, action: 'no_order_id' };
      }

      case 'payment_intent.succeeded': {
        const intent = data.object;
        console.log(
          `[Stripe] Paiement réussi: ${intent.id} — ${intent.amount / 100}$ CAD`
        );
        return { success: true, action: 'payment_logged' };
      }

      case 'payment_intent.payment_failed': {
        const failedIntent = data.object;
        const failedOrderId = failedIntent.metadata?.order_id;
        console.error(
          `[Stripe] Paiement échoué: ${failedIntent.id}`,
          failedIntent.last_payment_error?.message
        );

        if (failedOrderId && wooService) {
          await wooService.api.put(`orders/${failedOrderId}`, {
            status: 'failed',
          });
        }
        return { success: true, action: 'payment_failed_logged' };
      }

      default:
        console.log(`[Stripe] Événement non géré: ${type}`);
        return { success: true, action: 'ignored' };
    }
  }

  // ──────────────────────────────────────────────
  // REMBOURSEMENTS
  // ──────────────────────────────────────────────

  /**
   * Crée un remboursement
   * @param {string} paymentIntentId - ID du payment intent
   * @param {number} amount - Montant en dollars (optionnel, total si absent)
   * @param {string} reason - Raison du remboursement
   * @returns {Object} Résultat du remboursement
   */
  async createRefund(paymentIntentId, amount = null, reason = '') {
    try {
      const refundData = {
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          reason_detail: reason,
          source: 'hope-basketball-agent',
        },
      };

      if (amount) {
        refundData.amount = Math.round(amount * 100); // Remboursement partiel
      }

      const refund = await this.stripe.refunds.create(refundData);

      return {
        success: true,
        refund_id: refund.id,
        amount_refunded: refund.amount / 100,
        currency: refund.currency,
        status: refund.status,
      };
    } catch (error) {
      console.error('[Stripe] Erreur createRefund:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ──────────────────────────────────────────────
  // VÉRIFICATION DE PAIEMENT
  // ──────────────────────────────────────────────

  /**
   * Vérifie le statut d'un paiement
   * @param {string} sessionId - ID de la session Checkout
   * @returns {Object} Statut du paiement
   */
  async getPaymentStatus(sessionId) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);

      const statusMap = {
        complete: 'Paiement complété',
        expired: 'Session expirée',
        open: 'En attente de paiement',
      };

      return {
        success: true,
        session_id: session.id,
        payment_status: session.payment_status,
        status_label: statusMap[session.status] || session.status,
        amount_total: session.amount_total / 100,
        currency: session.currency,
        customer_email: session.customer_details?.email,
        order_id: session.metadata?.order_id,
      };
    } catch (error) {
      console.error('[Stripe] Erreur getPaymentStatus:', error.message);
      return { success: false, error: error.message };
    }
  }
}
