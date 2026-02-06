/**
 * Hope Basketball Agent — WooCommerce Service
 * Connecteur API REST WooCommerce pour la gestion des camps,
 * produits, commandes et disponibilités.
 * 
 * Stack: WordPress + WooCommerce + Stripe (sans Amelia)
 */

import WooCommerceRestApiPkg from '@woocommerce/woocommerce-rest-api';
const WooCommerceRestApi = WooCommerceRestApiPkg.default || WooCommerceRestApiPkg;

export class WooCommerceService {
  constructor() {
    this.api = new WooCommerceRestApi({
      url: process.env.WOO_URL,
      consumerKey: process.env.WOO_CONSUMER_KEY,
      consumerSecret: process.env.WOO_CONSUMER_SECRET,
      version: 'wc/v3',
    });
  }

  // ──────────────────────────────────────────────
  // CAMPS — Récupérer les camps disponibles
  // ──────────────────────────────────────────────

  /**
   * Récupère tous les camps d'été publiés
   * @param {Object} filters - Filtres optionnels (age, date, etc.)
   * @returns {Array} Liste des camps formatés
   */
  async getCamps(filters = {}) {
    try {
      const params = {
        per_page: 50,
        status: 'publish',
        search: 'Camp',
        orderby: 'date',
        order: 'asc',
      };

      const { data: products } = await this.api.get('products', params);

      let camps = products
        .filter((p) => this._isCampProduct(p))
        .map((p) => this._formatCamp(p));

      // Filtrage par âge
      if (filters.age) {
        camps = camps.filter(
          (c) => filters.age >= c.age_min && filters.age <= c.age_max
        );
      }

      // Filtrage par mois
      if (filters.month) {
        camps = camps.filter((c) => {
          const campMonth = new Date(c.start_date).getMonth() + 1;
          return campMonth === parseInt(filters.month);
        });
      }

      return {
        success: true,
        camps,
        total: camps.length,
      };
    } catch (error) {
      console.error('[WooCommerce] Erreur getCamps:', error.message);
      return { success: false, error: error.message, camps: [] };
    }
  }

  /**
   * Récupère un camp spécifique par ID
   * @param {number} productId
   * @returns {Object} Détails du camp
   */
  async getCampById(productId) {
    try {
      const { data: product } = await this.api.get(`products/${productId}`);
      if (!this._isCampProduct(product)) {
        return { success: false, error: 'Ce produit n\'est pas un camp.' };
      }
      return { success: true, camp: this._formatCamp(product) };
    } catch (error) {
      console.error('[WooCommerce] Erreur getCampById:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ──────────────────────────────────────────────
  // DISPONIBILITÉ — Vérifier les places restantes
  // ──────────────────────────────────────────────

  /**
   * Vérifie la disponibilité d'un camp
   * @param {number} productId
   * @returns {Object} Infos de disponibilité
   */
  async checkAvailability(productId) {
    try {
      const { data: product } = await this.api.get(`products/${productId}`);
      const camp = this._formatCamp(product);

      return {
        success: true,
        product_id: productId,
        name: camp.name,
        spots_total: camp.spots_total,
        spots_remaining: camp.spots_remaining,
        is_available: camp.spots_remaining > 0,
        price: camp.price,
        start_date: camp.start_date,
        end_date: camp.end_date,
      };
    } catch (error) {
      console.error('[WooCommerce] Erreur checkAvailability:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ──────────────────────────────────────────────
  // COMMANDES — Créer et gérer les inscriptions
  // ──────────────────────────────────────────────

  /**
   * Crée une commande (inscription à un camp)
   * @param {Object} bookingData - Données d'inscription
   * @returns {Object} Commande créée
   */
  async createOrder(bookingData) {
    try {
      const {
        product_id,
        quantity = 1,
        customer_first_name,
        customer_last_name,
        customer_email,
        customer_phone,
        child_name,
        child_age,
      } = bookingData;

      // Vérifier la disponibilité avant de créer
      const availability = await this.checkAvailability(product_id);
      if (!availability.success || !availability.is_available) {
        return {
          success: false,
          error: 'Désolé, ce camp est complet. Il n\'y a plus de places disponibles.',
        };
      }

      if (availability.spots_remaining < quantity) {
        return {
          success: false,
          error: `Il ne reste que ${availability.spots_remaining} place(s) pour ce camp.`,
        };
      }

      const orderData = {
        status: 'pending',
        billing: {
          first_name: customer_first_name,
          last_name: customer_last_name,
          email: customer_email,
          phone: customer_phone || '',
        },
        line_items: [
          {
            product_id: product_id,
            quantity: quantity,
          },
        ],
        meta_data: [
          { key: 'child_name', value: child_name || '' },
          { key: 'child_age', value: child_age ? String(child_age) : '' },
          { key: 'booking_source', value: 'hope-basketball-agent' },
        ],
      };

      const { data: order } = await this.api.post('orders', orderData);

      return {
        success: true,
        order_id: order.id,
        order_number: order.number,
        total: order.total,
        currency: order.currency,
        status: order.status,
        payment_url: order.payment_url,
        camp_name: availability.name,
        start_date: availability.start_date,
        end_date: availability.end_date,
      };
    } catch (error) {
      console.error('[WooCommerce] Erreur createOrder:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Récupère le statut d'une commande
   * @param {number} orderId
   * @returns {Object} Statut de la commande
   */
  async getOrderStatus(orderId) {
    try {
      const { data: order } = await this.api.get(`orders/${orderId}`);

      const statusMap = {
        pending: 'En attente de paiement',
        processing: 'Paiement reçu — inscription confirmée',
        completed: 'Inscription complétée',
        cancelled: 'Annulée',
        refunded: 'Remboursée',
        failed: 'Paiement échoué',
        'on-hold': 'En attente de vérification',
      };

      return {
        success: true,
        order_id: order.id,
        order_number: order.number,
        status: order.status,
        status_label: statusMap[order.status] || order.status,
        total: order.total,
        date_created: order.date_created,
        billing: {
          name: `${order.billing.first_name} ${order.billing.last_name}`,
          email: order.billing.email,
        },
      };
    } catch (error) {
      console.error('[WooCommerce] Erreur getOrderStatus:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Recherche une commande par email client
   * @param {string} email
   * @returns {Array} Commandes trouvées
   */
  async getOrdersByEmail(email) {
    try {
      const { data: orders } = await this.api.get('orders', {
        search: email,
        per_page: 10,
        orderby: 'date',
        order: 'desc',
      });

      return {
        success: true,
        orders: orders.map((o) => ({
          order_id: o.id,
          order_number: o.number,
          status: o.status,
          total: o.total,
          date: o.date_created,
          items: o.line_items.map((i) => i.name).join(', '),
        })),
      };
    } catch (error) {
      console.error('[WooCommerce] Erreur getOrdersByEmail:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ──────────────────────────────────────────────
  // PRODUITS MERCH — Merchandising
  // ──────────────────────────────────────────────

  /**
   * Récupère les produits merchandising (non-camps)
   * @returns {Array} Produits merch
   */
  async getMerchProducts() {
    try {
      const { data: products } = await this.api.get('products', {
        per_page: 50,
        status: 'publish',
      });

      const merch = products
        .filter((p) => !this._isCampProduct(p))
        .map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          regular_price: p.regular_price,
          sale_price: p.sale_price,
          description: p.short_description?.replace(/<[^>]*>/g, '') || '',
          in_stock: p.in_stock,
          image: p.images?.[0]?.src || null,
          permalink: p.permalink,
        }));

      return { success: true, products: merch, total: merch.length };
    } catch (error) {
      console.error('[WooCommerce] Erreur getMerchProducts:', error.message);
      return { success: false, error: error.message, products: [] };
    }
  }

  // ──────────────────────────────────────────────
  // UTILITAIRES INTERNES
  // ──────────────────────────────────────────────

  /**
   * Vérifie si un produit est un camp (via meta_data)
   */
  _isCampProduct(product) {
    const meta = product.meta_data || [];
    return meta.some(
      (m) => m.key === 'camp_start_date' || m.key === 'camp_end_date'
    );
  }

  /**
   * Formate un produit WooCommerce en objet camp
   */
  _formatCamp(product) {
    const getMeta = (key) => {
      const m = (product.meta_data || []).find((meta) => meta.key === key);
      return m ? m.value : null;
    };

    const spotsTotal = parseInt(getMeta('spots_total')) || 60;
    const stockQty = product.stock_quantity ?? spotsTotal;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      regular_price: product.regular_price,
      description: product.short_description?.replace(/<[^>]*>/g, '') || '',
      start_date: getMeta('camp_start_date'),
      end_date: getMeta('camp_end_date'),
      age_min: parseInt(getMeta('age_min')) || 8,
      age_max: parseInt(getMeta('age_max')) || 17,
      spots_total: spotsTotal,
      spots_remaining: stockQty,
      camp_hours: getMeta('camp_hours') || '9h00-16h00',
      daycare_included: getMeta('daycare_included') === 'yes',
      daycare_hours: getMeta('daycare_hours') || '8h00-9h00 / 16h00-17h00',
      image: product.images?.[0]?.src || null,
      permalink: product.permalink,
      in_stock: product.in_stock,
    };
  }
}
