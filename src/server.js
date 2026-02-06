/**
 * 🏀 Hope Basketball Agent — Serveur Principal
 * 
 * Agent conversationnel IA pour Hope Basketball Québec
 * Stack: Express + Claude API + WooCommerce + Stripe
 * 
 * @author David Courchesne — Kubos Solutions Informatiques
 */

import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { WooCommerceService } from './services/woocommerce.js';
import { StripeService } from './services/stripe.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ──────────────────────────────────────────────
// INITIALISATION DES SERVICES
// ──────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const wooService = new WooCommerceService();
const stripeService = new StripeService();

// Sessions en mémoire (remplacer par Redis en production si nécessaire)
const sessions = new Map();

// ──────────────────────────────────────────────
// MIDDLEWARE
// ──────────────────────────────────────────────

// CORS — accepter les requêtes du site WordPress
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'https://hopebasketballquebec.com',
    methods: ['GET', 'POST'],
    credentials: true,
  })
);

// JSON pour toutes les routes SAUF le webhook Stripe (raw body requis)
app.use((req, res, next) => {
  if (req.path === '/webhook/stripe') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

// ──────────────────────────────────────────────
// SYSTEM PROMPT — Personnalité de l'agent
// ──────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es l'assistant virtuel de Hope Basketball Québec, une académie de basketball pour les jeunes de 8 à 17 ans à Québec.

🏀 À PROPOS DE HOPE BASKETBALL
- Fondé par Jason Hope, travailleur social et ancien joueur de basketball
- Mission sociale : rendre le basketball accessible à tous les jeunes, peu importe leur situation économique
- Environ 15 places gratuites par camp pour les jeunes de milieux défavorisés
- Sanctionné par Basketball Québec, partenaire du Rouge et Or
- Lieu principal : Collège Mariste de Québec, 2315 Chemin St-Louis

📅 CAMPS D'ÉTÉ 2026
- 7 semaines disponibles (juin à août)
- Semaine 1 (24-25 juin) : 140$ — 2 jours
- Semaines 2 à 7 : 350$ chacune — semaines complètes
- Horaire : 9h00 à 16h00
- Service de garde inclus : 8h00-9h00 et 16h00-17h00
- Capacité : 60 places par semaine
- Âges : 8 à 17 ans
- Prix avant taxes

🗣️ TON ET PERSONNALITÉ
- Amical, chaleureux et professionnel
- Utilise un français québécois naturel (pas trop formel, pas trop familier)
- Passionné par le basketball et le développement des jeunes
- Toujours encourageant et positif
- Réponds de façon concise mais complète

📋 PROCESSUS D'INSCRIPTION
1. Le parent choisit une ou plusieurs semaines
2. Tu collectes : nom du parent, email, téléphone, nom de l'enfant, âge
3. Tu crées la commande et génères un lien de paiement sécurisé (Stripe)
4. Le parent paie en ligne
5. Confirmation automatique par email

💡 INFORMATIONS IMPORTANTES
- Contact : info.hopebasketballquebec@gmail.com
- Les enfants doivent apporter : lunch, collations, bouteille d'eau, vêtements de sport, chaussures intérieures
- Aucune expérience requise — tous les niveaux sont bienvenus
- Politique de remboursement : contacter Hope Basketball directement

Utilise les outils (tools) disponibles pour :
- Consulter les camps et disponibilités en temps réel
- Créer des commandes d'inscription
- Générer des liens de paiement sécurisés
- Vérifier le statut d'une commande

Ne jamais inventer de données — utilise toujours les tools pour obtenir l'information en temps réel.`;

// ──────────────────────────────────────────────
// DÉFINITION DES TOOLS CLAUDE
// ──────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_camps',
    description:
      'Récupère la liste des camps de basketball disponibles. Peut filtrer par âge ou mois.',
    input_schema: {
      type: 'object',
      properties: {
        age: {
          type: 'number',
          description: "Âge de l'enfant pour filtrer les camps appropriés",
        },
        month: {
          type: 'number',
          description: 'Numéro du mois (6=juin, 7=juillet, 8=août)',
        },
      },
    },
  },
  {
    name: 'check_availability',
    description:
      "Vérifie le nombre de places disponibles pour un camp spécifique par son ID produit.",
    input_schema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'number',
          description: 'ID du produit camp dans WooCommerce',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'create_booking',
    description:
      "Crée une inscription (commande WooCommerce) pour un camp. Requiert les informations du parent et de l'enfant.",
    input_schema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'number',
          description: 'ID du camp choisi',
        },
        quantity: {
          type: 'number',
          description: "Nombre d'inscriptions (défaut: 1)",
          default: 1,
        },
        customer_first_name: {
          type: 'string',
          description: 'Prénom du parent',
        },
        customer_last_name: {
          type: 'string',
          description: 'Nom de famille du parent',
        },
        customer_email: {
          type: 'string',
          description: 'Email du parent',
        },
        customer_phone: {
          type: 'string',
          description: 'Téléphone du parent',
        },
        child_name: {
          type: 'string',
          description: "Prénom de l'enfant",
        },
        child_age: {
          type: 'number',
          description: "Âge de l'enfant",
        },
      },
      required: [
        'product_id',
        'customer_first_name',
        'customer_last_name',
        'customer_email',
        'child_name',
        'child_age',
      ],
    },
  },
  {
    name: 'create_payment_link',
    description:
      'Génère un lien de paiement Stripe sécurisé pour une commande existante.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'number',
          description: 'ID de la commande WooCommerce',
        },
        camp_name: {
          type: 'string',
          description: 'Nom du camp pour le reçu',
        },
        price: {
          type: 'string',
          description: 'Prix en dollars (ex: "350.00")',
        },
        customer_email: {
          type: 'string',
          description: 'Email du client',
        },
        child_name: {
          type: 'string',
          description: "Nom de l'enfant inscrit",
        },
      },
      required: ['order_id', 'camp_name', 'price'],
    },
  },
  {
    name: 'get_order_status',
    description:
      "Vérifie le statut d'une commande/inscription par numéro de commande ou email.",
    input_schema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'number',
          description: 'Numéro de commande',
        },
        email: {
          type: 'string',
          description: 'Email du client (pour recherche)',
        },
      },
    },
  },
  {
    name: 'get_merch',
    description:
      'Récupère la liste des produits merchandising Hope Basketball (chandails, accessoires, etc.).',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_faq',
    description:
      'Retourne les questions fréquemment posées sur les camps Hope Basketball.',
    input_schema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'Sujet de la question (inscription, paiement, annulation, equipement, general)',
        },
      },
    },
  },
];

// ──────────────────────────────────────────────
// EXÉCUTION DES TOOLS
// ──────────────────────────────────────────────

async function executeTool(toolName, toolInput) {
  console.log(`[Tool] Exécution: ${toolName}`, JSON.stringify(toolInput));

  switch (toolName) {
    case 'get_camps':
      return await wooService.getCamps(toolInput);

    case 'check_availability':
      return await wooService.checkAvailability(toolInput.product_id);

    case 'create_booking':
      return await wooService.createOrder(toolInput);

    case 'create_payment_link': {
      const result = await stripeService.createPaymentLink({
        order_id: toolInput.order_id,
        camp_name: toolInput.camp_name,
        price: toolInput.price,
        customer_email: toolInput.customer_email,
        child_name: toolInput.child_name,
      });
      return result;
    }

    case 'get_order_status': {
      if (toolInput.order_id) {
        return await wooService.getOrderStatus(toolInput.order_id);
      } else if (toolInput.email) {
        return await wooService.getOrdersByEmail(toolInput.email);
      }
      return { success: false, error: 'Veuillez fournir un numéro de commande ou un email.' };
    }

    case 'get_merch':
      return await wooService.getMerchProducts();

    case 'get_faq':
      return getFAQ(toolInput.topic);

    default:
      return { error: `Outil inconnu: ${toolName}` };
  }
}

// ──────────────────────────────────────────────
// FAQ STATIQUE
// ──────────────────────────────────────────────

function getFAQ(topic) {
  const faqs = {
    inscription: [
      {
        q: "Comment inscrire mon enfant?",
        a: "Vous pouvez inscrire votre enfant directement via ce chat! Je vais vous guider étape par étape. Vous aurez besoin du nom de votre enfant, son âge, et vos coordonnées. Le paiement se fait en ligne par carte de crédit via Stripe (sécurisé).",
      },
      {
        q: "Peut-on inscrire plusieurs enfants?",
        a: "Absolument! Vous pouvez inscrire plusieurs enfants. Chaque inscription est traitée séparément pour que chaque enfant ait sa place réservée.",
      },
    ],
    paiement: [
      {
        q: "Quels modes de paiement acceptez-vous?",
        a: "Nous acceptons les paiements par carte de crédit (Visa, Mastercard, American Express) via notre plateforme sécurisée Stripe.",
      },
      {
        q: "Les taxes sont-elles incluses?",
        a: "Les prix affichés sont avant taxes. La TPS (5%) et la TVQ (9.975%) s'appliquent au montant.",
      },
    ],
    annulation: [
      {
        q: "Quelle est votre politique d'annulation?",
        a: "Pour toute demande d'annulation ou de remboursement, veuillez contacter Hope Basketball directement à info.hopebasketballquebec@gmail.com. Chaque situation est évaluée individuellement.",
      },
    ],
    equipement: [
      {
        q: "Que doit apporter mon enfant?",
        a: "Votre enfant doit apporter : un lunch et des collations, une bouteille d'eau, des vêtements de sport confortables, et des chaussures de sport intérieures (semelles non marquantes). Un ballon de basketball est fourni sur place.",
      },
      {
        q: "Y a-t-il un service de garde?",
        a: "Oui! Le service de garde est inclus dans le prix du camp. Il est disponible de 8h00 à 9h00 le matin et de 16h00 à 17h00 l'après-midi.",
      },
    ],
    general: [
      {
        q: "À quel âge peut-on participer?",
        a: "Les camps sont ouverts aux jeunes de 8 à 17 ans, tous niveaux confondus. Aucune expérience en basketball n'est requise!",
      },
      {
        q: "Où se déroulent les camps?",
        a: "Les camps se déroulent au Collège Mariste de Québec, situé au 2315 Chemin St-Louis, Québec.",
      },
      {
        q: "Y a-t-il des places gratuites?",
        a: "Oui! Hope Basketball offre environ 15 places gratuites par camp pour les jeunes de milieux défavorisés. C'est au cœur de notre mission sociale. Contactez-nous pour en savoir plus.",
      },
    ],
  };

  if (topic && faqs[topic]) {
    return { success: true, faqs: faqs[topic], topic };
  }

  // Retourner toutes les FAQs
  const allFaqs = Object.entries(faqs).flatMap(([cat, items]) =>
    items.map((item) => ({ ...item, category: cat }))
  );
  return { success: true, faqs: allFaqs, topic: 'all' };
}

// ──────────────────────────────────────────────
// ROUTE PRINCIPALE — Chat avec l'agent
// ──────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  try {
    const { message, session_id } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message requis' });
    }

    // Gestion de session
    const sessionId = session_id || `session_${Date.now()}`;
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { messages: [], created_at: Date.now() });
    }
    const session = sessions.get(sessionId);

    // Ajouter le message utilisateur
    session.messages.push({ role: 'user', content: message });

    // Limiter l'historique à 20 messages pour le contexte
    const contextMessages = session.messages.slice(-20);

    // Appel Claude API avec tool use loop
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: contextMessages,
    });

    // Boucle de tool use — exécuter les tools jusqu'à réponse finale
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block) => block.type === 'tool_use'
      );

      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(toolUse.name, toolUse.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Ajouter l'échange tool au contexte
      session.messages.push({ role: 'assistant', content: response.content });
      session.messages.push({ role: 'user', content: toolResults });

      // Relancer Claude avec les résultats
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: session.messages.slice(-20),
      });
    }

    // Extraire la réponse texte
    const assistantMessage =
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n') || "Désolé, je n'ai pas pu traiter votre demande.";

    // Sauvegarder la réponse dans la session
    session.messages.push({ role: 'assistant', content: assistantMessage });

    res.json({
      response: assistantMessage,
      session_id: sessionId,
    });
  } catch (error) {
    console.error('[Chat] Erreur:', error);
    res.status(500).json({
      error: "Désolé, une erreur s'est produite. Veuillez réessayer.",
    });
  }
});

// ──────────────────────────────────────────────
// WEBHOOK STRIPE
// ──────────────────────────────────────────────

app.post('/webhook/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];

  const { success, event, error } = stripeService.verifyWebhook(
    req.body,
    signature
  );

  if (!success) {
    console.error('[Webhook] Signature invalide:', error);
    return res.status(400).json({ error: 'Signature invalide' });
  }

  const result = await stripeService.handleWebhookEvent(event, wooService);
  console.log(`[Webhook] ${event.type}:`, result);

  res.json({ received: true });
});

// ──────────────────────────────────────────────
// ROUTES UTILITAIRES
// ──────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Hope Basketball Agent',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

// Camps publics (sans auth)
app.get('/api/camps', async (req, res) => {
  const result = await wooService.getCamps(req.query);
  res.json(result);
});

// ──────────────────────────────────────────────
// NETTOYAGE DES SESSIONS EXPIRÉES
// ──────────────────────────────────────────────

function cleanExpiredSessions() {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 heures
  for (const [id, session] of sessions) {
    if (now - session.created_at > maxAge) {
      sessions.delete(id);
    }
  }
}

// ──────────────────────────────────────────────
// DÉMARRAGE
// ──────────────────────────────────────────────

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🏀 Hope Basketball Agent — Port ${PORT}`);
    console.log(`   API: http://localhost:${PORT}/api/chat`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Webhook: http://localhost:${PORT}/webhook/stripe`);
  });
}

export default app;
