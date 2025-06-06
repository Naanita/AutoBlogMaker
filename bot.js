require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const client = new Client({
  puppeteer: {
    headless: true,
    args: ["--no-sandbox"],
  },
  authStrategy: new LocalAuth({ clientId: "bot1" }),
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2411.2.html",
  },
  authTimeoutMs: 60000,
  qrTimeout: 30000,
});

const conversationStates = {};
const timeouts = {};

// Lee los usuarios y nombres permitidos del .env
const usuariosPermitidos = process.env.USUARIOS_PERMITIDOS
  ? Object.fromEntries(
      process.env.USUARIOS_PERMITIDOS.split(",").map(pair => {
        const [usuario, nombre] = pair.split(":").map(s => s.trim());
        return [usuario.toUpperCase(), nombre];
      })
    )
  : {};

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("authenticated", () => {
  console.log("Client is authenticated!");
});

client.on("auth_failure", (msg) => {
  console.error("Authentication failure", msg);
});

function clearTimeouts(from) {
  if (timeouts[from]) {
    clearTimeout(timeouts[from].recordatorio);
    clearTimeout(timeouts[from].finalizacion);
    delete timeouts[from];
  }
}

client.on("message", async (msg) => {
  const from = msg.from;
  const body = msg.body.trim();

  // Si es la primera vez o terminó, inicia el flujo
  if (!conversationStates[from] || conversationStates[from] === "ended") {
    conversationStates[from] = "saludo";
    clearTimeouts(from);
    await client.sendMessage(from, "¡Hola! 👋 Soy HikBot, ¿en qué puedo ayudarte?");
    // Opciones después de 1 segundo
    setTimeout(async () => {
      if (conversationStates[from] === "saludo") {
        conversationStates[from] = "esperando_opcion";
        await client.sendMessage(from, "¿Qué quieres hacer?\n1. Estado de cuenta\n2. Creación de blogs");
        // Recordatorio a los 5 segundos si no responde
        timeouts[from] = {
          recordatorio: setTimeout(async () => {
            if (conversationStates[from] === "esperando_opcion") {
              await client.sendMessage(from, "¿Estás ahí?");
              // Finalización a los 5 segundos después del recordatorio
              timeouts[from].finalizacion = setTimeout(async () => {
                if (conversationStates[from] === "esperando_opcion") {
                  await client.sendMessage(from, "Chat finalizado por inactividad. Escribe cualquier mensaje para iniciar de nuevo.");
                  conversationStates[from] = "ended";
                  clearTimeouts(from);
                }
              }, 3600000);
            }
          }, 3600000)
        };
      }
    }, 1000);
    return;
  }

  // Si está esperando una opción
  if (conversationStates[from] === "esperando_opcion") {
    clearTimeouts(from);
    switch (body) {
      case "1":
        await client.sendMessage(from, "Elegiste la opción 1: Estado de cuenta. Escribe cualquier mensaje para reiniciar.");
        conversationStates[from] = "ended";
        break;
      case "2":
        conversationStates[from] = "esperando_usuario";
        await client.sendMessage(from, "Por favor, ingresa tu usuario");
        // Recordatorio a los 5 segundos si no responde
        timeouts[from] = {
          recordatorio: setTimeout(async () => {
            if (conversationStates[from] === "esperando_usuario") {
              await client.sendMessage(from, "¿Estás ahí?");
              // Finalización a los 5 segundos después del recordatorio
              timeouts[from].finalizacion = setTimeout(async () => {
                if (conversationStates[from] === "esperando_usuario") {
                  await client.sendMessage(from, "Chat finalizado por inactividad. Escribe cualquier mensaje para iniciar de nuevo.");
                  conversationStates[from] = "ended";
                  clearTimeouts(from);
                }
              }, 5000);
            }
          }, 5000)
        };
        break;
      default:
        await client.sendMessage(from, "Opción no válida. Por favor, responde con 1 o 2.");
    }
    return;
  }

  // Si está esperando el usuario para la opción 2
  if (conversationStates[from] === "esperando_usuario") {
    clearTimeouts(from);
    const usuario = body.toUpperCase();
    if (usuariosPermitidos[usuario]) {
      await client.sendMessage(from, `¡Hola, ${usuariosPermitidos[usuario]}! Tu usuario (${usuario}) ha sido reconocido. ¿Necesitas algo más? Escribe cualquier mensaje para reiniciar.`);
      conversationStates[from] = "ended";
    } else {
      await client.sendMessage(from, "Usuario no reconocido o no autorizado. Intenta de nuevo o escribe cualquier mensaje para reiniciar.");
      conversationStates[from] = "ended";
    }
    return;
  }

  // Si manda cualquier mensaje después, reinicia el ciclo
  if (conversationStates[from] === "ended") {
    conversationStates[from] = "saludo";
    clearTimeouts(from);
    await client.sendMessage(from, "¡Hola! 👋 Soy HikBot, ¿en qué puedo ayudarte?");
    setTimeout(async () => {
      if (conversationStates[from] === "saludo") {
        conversationStates[from] = "esperando_opcion";
        await client.sendMessage(from, "¿Qué quieres hacer?\n1. Estado de cuenta\n2. Creación de blogs");
        // Recordatorio a los 5 segundos si no responde
        timeouts[from] = {
          recordatorio: setTimeout(async () => {
            if (conversationStates[from] === "esperando_opcion") {
              await client.sendMessage(from, "¿Estás ahí?");
              // Finalización a los 5 segundos después del recordatorio
              timeouts[from].finalizacion = setTimeout(async () => {
                if (conversationStates[from] === "esperando_opcion") {
                  await client.sendMessage(from, "Chat finalizado por inactividad. Escribe cualquier mensaje para iniciar de nuevo.");
                  conversationStates[from] = "ended";
                  clearTimeouts(from);
                }
              }, 5000);
            }
          }, 5000)
        };
      }
    }, 1000);
    return;
  }
});

client
  .initialize()
  .then(() => {
    console.log("Client initialized successfully");
  })
  .catch((err) => {
    console.error("Error initializing client", err);
  });



