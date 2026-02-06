/**
 * 🏀 Hope Basketball Agent — Widget Chat
 * Widget conversationnel à intégrer dans WordPress (Avada Footer Scripts)
 * 
 * Utilisation: Ajouter ce script dans Avada → Theme Options → Footer Scripts
 * <script src="https://[BACKEND_URL]/widget/chat-widget.js"></script>
 */

(function () {
  'use strict';

  const CONFIG = {
    // ⚠️ Modifier cette URL après le déploiement du backend
    API_URL: 'https://hope-agent.vercel.app',
    BRAND: {
      primary: '#00a8e8',     // Bleu Hope Basketball
      primaryDark: '#0088c2',
      secondary: '#1a1a2e',   // Noir profond
      white: '#ffffff',
      gray: '#f5f5f7',
      grayText: '#6b7280',
      text: '#1a1a2e',
    },
    WELCOME_MESSAGE:
      'Bienvenue chez Hope Basketball Québec! 🏀 Je suis là pour vous aider avec les inscriptions aux camps, les informations sur nos programmes, ou toute autre question. Comment puis-je vous aider?',
  };

  // ─── Styles CSS ───

  const styles = `
    #hope-chat-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #hope-chat-toggle {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${CONFIG.BRAND.primary};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0, 168, 232, 0.4);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    #hope-chat-toggle:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 28px rgba(0, 168, 232, 0.5);
    }

    #hope-chat-toggle svg {
      width: 28px;
      height: 28px;
      fill: white;
    }

    #hope-chat-window {
      display: none;
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 520px;
      max-height: calc(100vh - 120px);
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
      flex-direction: column;
      overflow: hidden;
    }

    #hope-chat-window.open {
      display: flex;
    }

    .hope-chat-header {
      background: ${CONFIG.BRAND.primary};
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .hope-chat-header-logo {
      width: 36px;
      height: 36px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .hope-chat-header-text h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }

    .hope-chat-header-text p {
      margin: 2px 0 0;
      font-size: 12px;
      opacity: 0.85;
    }

    .hope-chat-close {
      margin-left: auto;
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      opacity: 0.8;
    }

    .hope-chat-close:hover {
      opacity: 1;
    }

    .hope-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scroll-behavior: smooth;
    }

    .hope-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
    }

    .hope-msg.bot {
      background: ${CONFIG.BRAND.gray};
      color: ${CONFIG.BRAND.text};
      border-bottom-left-radius: 4px;
      align-self: flex-start;
    }

    .hope-msg.user {
      background: ${CONFIG.BRAND.primary};
      color: white;
      border-bottom-right-radius: 4px;
      align-self: flex-end;
    }

    .hope-msg.bot a {
      color: ${CONFIG.BRAND.primary};
      text-decoration: underline;
    }

    .hope-typing {
      display: none;
      align-self: flex-start;
      padding: 10px 14px;
      background: ${CONFIG.BRAND.gray};
      border-radius: 16px;
      border-bottom-left-radius: 4px;
    }

    .hope-typing.active {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .hope-typing-dot {
      width: 7px;
      height: 7px;
      background: ${CONFIG.BRAND.grayText};
      border-radius: 50%;
      animation: hopeBounce 1.2s infinite;
    }

    .hope-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .hope-typing-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes hopeBounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }

    .hope-chat-input-area {
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .hope-chat-input {
      flex: 1;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      padding: 10px 16px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    .hope-chat-input:focus {
      border-color: ${CONFIG.BRAND.primary};
    }

    .hope-chat-send {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: ${CONFIG.BRAND.primary};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .hope-chat-send:hover {
      background: ${CONFIG.BRAND.primaryDark};
    }

    .hope-chat-send:disabled {
      background: #d1d5db;
      cursor: not-allowed;
    }

    .hope-chat-send svg {
      width: 18px;
      height: 18px;
      fill: white;
    }

    /* Powered by */
    .hope-chat-footer {
      text-align: center;
      padding: 6px;
      font-size: 10px;
      color: ${CONFIG.BRAND.grayText};
    }

    /* Mobile */
    @media (max-width: 480px) {
      #hope-chat-window {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        bottom: 0;
        right: 0;
        border-radius: 0;
      }

      #hope-chat-toggle {
        bottom: 16px;
        right: 16px;
      }
    }
  `;

  // ─── HTML du widget ───

  function createWidget() {
    // Injecter CSS
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    // Container
    const widget = document.createElement('div');
    widget.id = 'hope-chat-widget';
    widget.innerHTML = `
      <div id="hope-chat-window">
        <div class="hope-chat-header">
          <div class="hope-chat-header-logo">🏀</div>
          <div class="hope-chat-header-text">
            <h3>Hope Basketball</h3>
            <p>Assistant d'inscription</p>
          </div>
          <button class="hope-chat-close" onclick="HopeChat.toggle()">✕</button>
        </div>
        <div class="hope-chat-messages" id="hope-messages">
          <div class="hope-msg bot">${CONFIG.WELCOME_MESSAGE}</div>
        </div>
        <div class="hope-typing" id="hope-typing">
          <div class="hope-typing-dot"></div>
          <div class="hope-typing-dot"></div>
          <div class="hope-typing-dot"></div>
        </div>
        <div class="hope-chat-input-area">
          <input
            class="hope-chat-input"
            id="hope-input"
            type="text"
            placeholder="Écrivez votre message..."
            autocomplete="off"
          />
          <button class="hope-chat-send" id="hope-send" onclick="HopeChat.send()">
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="hope-chat-footer">Propulsé par Hope Basketball Québec</div>
      </div>
      <button id="hope-chat-toggle" onclick="HopeChat.toggle()">
        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
      </button>
    `;
    document.body.appendChild(widget);
  }

  // ─── Logique du chat ───

  let sessionId = localStorage.getItem('hope_session_id') || null;
  let isOpen = false;
  let isSending = false;

  window.HopeChat = {
    toggle() {
      isOpen = !isOpen;
      const win = document.getElementById('hope-chat-window');
      if (isOpen) {
        win.classList.add('open');
        document.getElementById('hope-input').focus();
      } else {
        win.classList.remove('open');
      }
    },

    async send() {
      if (isSending) return;

      const input = document.getElementById('hope-input');
      const message = input.value.trim();
      if (!message) return;

      // Afficher le message utilisateur
      this.addMessage(message, 'user');
      input.value = '';
      isSending = true;
      this.setTyping(true);
      document.getElementById('hope-send').disabled = true;

      try {
        const res = await fetch(`${CONFIG.API_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            session_id: sessionId,
          }),
        });

        const data = await res.json();

        if (data.session_id) {
          sessionId = data.session_id;
          localStorage.setItem('hope_session_id', sessionId);
        }

        this.addMessage(data.response || data.error || 'Erreur de communication.', 'bot');
      } catch (err) {
        console.error('[HopeChat] Erreur:', err);
        this.addMessage(
          'Désolé, je ne suis pas disponible pour le moment. Veuillez réessayer ou nous contacter à info.hopebasketballquebec@gmail.com.',
          'bot'
        );
      } finally {
        isSending = false;
        this.setTyping(false);
        document.getElementById('hope-send').disabled = false;
      }
    },

    addMessage(text, sender) {
      const container = document.getElementById('hope-messages');
      const msg = document.createElement('div');
      msg.className = `hope-msg ${sender}`;

      // Convertir les liens en HTML cliquables
      msg.innerHTML = text.replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener">$1</a>'
      );

      container.appendChild(msg);
      container.scrollTop = container.scrollHeight;
    },

    setTyping(active) {
      const typing = document.getElementById('hope-typing');
      typing.classList.toggle('active', active);
      if (active) {
        const container = document.getElementById('hope-messages');
        container.scrollTop = container.scrollHeight;
      }
    },
  };

  // ─── Événement Enter ───

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement?.id === 'hope-input') {
      e.preventDefault();
      HopeChat.send();
    }
  });

  // ─── Initialisation ───

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
