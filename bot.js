require("dotenv").config();
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const { Document, Packer, Paragraph, TextRun } = require("docx");

const client = new Client({
  puppeteer: {
    headless: true,
    args: ["--no-sandbox"],
  },
  authStrategy: new LocalAuth({ clientId: "bot1" }),
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2411.2.html",
  },
  authTimeoutMs: 60000,
  qrTimeout: 30000,
});

const conversationStates = {};
const userData = {};
const timeouts = {};

// --- NUEVO: Configuración de objetivos y rangos ---
const OBJETIVOS_CONFIG = {
  "Generar leads": {
    palabras: [600, 1200],
    caracteres: [4000, 8000],
  },
  "Educar al cliente": {
    palabras: [1000, 2000],
    caracteres: [7000, 14000],
  },
  "Posicionar producto": {
    palabras: [800, 1500],
    caracteres: [5500, 10000],
  },
  "Aumentar tráfico web": {
    palabras: [1500, 2500],
    caracteres: [10000, 17000],
  },
};

// Calcula el promedio de rangos si hay dos objetivos, o usa el rango único si hay uno
function calcularLongitudYCaracteres(objetivos) {
  if (!objetivos || !Array.isArray(objetivos) || objetivos.length === 0) {
    return { longitud: "800", caracteres: "6000" };
  }
  let palabrasMin = 0,
    palabrasMax = 0,
    caracteresMin = 0,
    caracteresMax = 0;
  objetivos.forEach((obj) => {
    const conf = OBJETIVOS_CONFIG[obj];
    if (conf) {
      palabrasMin += conf.palabras[0];
      palabrasMax += conf.palabras[1];
      caracteresMin += conf.caracteres[0];
      caracteresMax += conf.caracteres[1];
    }
  });
  const n = objetivos.length;
  // Promedio si hay dos, o único si hay uno
  return {
    longitud: Math.round((palabrasMin + palabrasMax) / (2 * n)).toString(),
    caracteres: Math.round(
      (caracteresMin + caracteresMax) / (2 * n)
    ).toString(),
  };
}

// --- NUEVO: Manejo de inactividad de 45 minutos ---
function setLongTimeouts(from) {
  clearLongTimeouts(from);
  timeouts[from] = timeouts[from] || {};
  // Primer recordatorio a los 45 minutos
  timeouts[from].longRecordatorio = setTimeout(async () => {
    if (conversationStates[from] !== "ended") {
      await client.sendMessage(
        from,
        "¿Cómo estás? ¿Necesitas algo más?\nEscribe '0' para cerrar el chat y despedirme."
      );
      // Segundo timeout: cerrar chat a los 90 minutos
      timeouts[from].longFinalizacion = setTimeout(async () => {
        if (conversationStates[from] !== "ended") {
          await client.sendMessage(
            from,
            "El chat se cerró por inactividad. ¡Hasta luego!"
          );
          conversationStates[from] = "ended";
          clearTimeouts(from);
        }
      }, 45 * 60 * 1000); // 45 minutos más
    }
  }, 45 * 60 * 1000); // 45 minutos
}

function clearLongTimeouts(from) {
  if (timeouts[from]) {
    if (timeouts[from].longRecordatorio)
      clearTimeout(timeouts[from].longRecordatorio);
    if (timeouts[from].longFinalizacion)
      clearTimeout(timeouts[from].longFinalizacion);
    delete timeouts[from].longRecordatorio;
    delete timeouts[from].longFinalizacion;
  }
}

function clearTimeouts(from) {
  if (timeouts[from]) {
    if (timeouts[from].recordatorio) clearTimeout(timeouts[from].recordatorio);
    if (timeouts[from].finalizacion) clearTimeout(timeouts[from].finalizacion);
    clearLongTimeouts(from);
    delete timeouts[from];
  }
}

function handleError(from, error) {
  console.error("Error:", error);
  client.sendMessage(
    from,
    "Ocurrió un error inesperado. Por favor, intenta de nuevo."
  );
  conversationStates[from] = "ended";
  clearTimeouts(from);
}

client.on("qr", (qr) => {
  try {
    qrcode.generate(qr, { small: true });
  } catch (error) {
    console.error("QR error:", error);
  }
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

client.on("message", async (msg) => {
  const from = msg.from;
  const body = msg.body.trim();

  // --- NUEVO: Permitir cerrar chat con '0' en cualquier momento ---
  if (body === "0" && conversationStates[from] !== "ended") {
    await client.sendMessage(
      from,
      "¡Gracias por usar HikBot! Chat finalizado. 😊"
    );
    conversationStates[from] = "ended";
    clearTimeouts(from);
    return;
  }

  try {
    // Evita doble respuesta si el usuario manda varios mensajes al inicio
    if (!conversationStates[from]) {
      conversationStates[from] = "saludo";
      userData[from] = {};
      clearTimeouts(from);
      setLongTimeouts(from);
      await client.sendMessage(
        from,
        "¡Hola! 👋 Soy HikBot, ¿qué deseas crear?"
      );
      setTimeout(async () => {
        if (conversationStates[from] === "saludo") {
          conversationStates[from] = "esperando_tipo_contenido";
          await client.sendMessage(from, "Opciones:\n1. Blog");
          // Recordatorio y finalización por inactividad
          timeouts[from] = timeouts[from] || {};
          timeouts[from].recordatorio = setTimeout(async () => {
            if (conversationStates[from] === "esperando_tipo_contenido") {
              await client.sendMessage(from, "¿Estás ahí?");
              timeouts[from].finalizacion = setTimeout(async () => {
                if (conversationStates[from] === "esperando_tipo_contenido") {
                  await client.sendMessage(
                    from,
                    "Chat finalizado por inactividad. Escribe cualquier mensaje para iniciar de nuevo."
                  );
                  conversationStates[from] = "ended";
                  clearTimeouts(from);
                }
              }, 60000);
            }
          }, 60000);
        }
      }, 1000);
      return;
    }

    setLongTimeouts(from); // Reinicia el timeout largo en cada mensaje

    // Flujo principal
    switch (conversationStates[from]) {
      case "saludo":
        // Ignora mensajes extra mientras espera la opción
        break;

      case "esperando_tipo_contenido":
        clearTimeouts(from);
        setLongTimeouts(from);
        if (body === "1" || /blog/i.test(body)) {
          conversationStates[from] = "esperando_campania";
          await client.sendMessage(
            from,
            "¿Para qué campaña es el contenido?\n1. ColorVu3.0\n2. FlexVu\n3. AcuSeek"
          );
        } else {
          await client.sendMessage(
            from,
            "Por favor, responde con '1' para Blog."
          );
        }
        break;

      case "esperando_campania":
        clearTimeouts(from);
        setLongTimeouts(from);
        let campania = "";
        if (body === "1") campania = "ColorVu3.0";
        else if (body === "2") campania = "FlexVu";
        else if (body === "3") campania = "AcuSeek";
        else campania = body;
        userData[from].campania = campania;
        conversationStates[from] = "esperando_publico";
        await client.sendMessage(
          from,
          "¿Para quién va dirigido?\n1. B2B\n2. B2C\n3. B2B & B2C"
        );
        break;

      case "esperando_publico":
        clearTimeouts(from);
        setLongTimeouts(from);
        let publico = "";
        if (body === "1") publico = "B2B";
        else if (body === "2") publico = "B2C";
        else if (body === "3") publico = "B2B & B2C";
        else publico = body;
        userData[from].publico = publico;
        conversationStates[from] = "esperando_objetivo";
        await client.sendMessage(
          from,
          "¿Qué deseas lograr con el blog?\n1. Generar leads\n2. Educar al cliente\n3. Posicionar producto\n4. Aumentar tráfico web"
        );
        break;

      case "esperando_objetivo":
        clearTimeouts(from);
        setLongTimeouts(from);
        // Permitir seleccionar hasta 2 objetivos
        if (!userData[from].objetivosSeleccionados)
          userData[from].objetivosSeleccionados = [];
        let objetivo = "";
        if (["1", "2", "3", "4"].includes(body)) {
          if (body === "1") objetivo = "Generar leads";
          if (body === "2") objetivo = "Educar al cliente";
          if (body === "3") objetivo = "Posicionar producto";
          if (body === "4") objetivo = "Aumentar tráfico web";
          // Evitar duplicados y máximo 2 objetivos
          if (
            !userData[from].objetivosSeleccionados.includes(objetivo) &&
            userData[from].objetivosSeleccionados.length < 2
          ) {
            userData[from].objetivosSeleccionados.push(objetivo);
          }

          // Calcular longitud y caracteres según los objetivos seleccionados
          const { longitud, caracteres } = calcularLongitudYCaracteres(
            userData[from].objetivosSeleccionados
          );
          userData[from].longitud = longitud;
          userData[from].caracteres = caracteres;
        } else {
          await client.sendMessage(
            from,
            "Por favor, responde con el número del objetivo:\n1. Generar leads\n2. Educar al cliente\n3. Posicionar producto\n4. Aumentar tráfico web"
          );
          return;
        }

        // Solo preguntar si desea agregar otro objetivo si tiene 1 objetivo, y solo si aún no tiene 2
        if (userData[from].objetivosSeleccionados.length === 1) {
          conversationStates[from] = "agregar_otro_objetivo";
          await client.sendMessage(
            from,
            "¿Deseas agregar otro objetivo?\n1. Sí\n2. No"
          );
        } else if (userData[from].objetivosSeleccionados.length === 2) {
          // Si ya tiene 2, continuar sin volver a preguntar
          userData[from].objetivo =
            userData[from].objetivosSeleccionados.join(" y ");
          userData[from].keyword = userData[from].campania;
          conversationStates[from] = "generando_blog";
          await client.sendMessage(
            from,
            "Generando tu blog, esto puede tardar unos segundos..."
          );
          setTimeout(async () => {
            try {
              const blog = generarPromptBlog(userData[from]);
              userData[from].blog = blog;
              conversationStates[from] = "ajustar_exportar";
              await client.sendMessage(
                from,
                `Aquí tienes tu blog (prompt generado):\n\n${blog}`
              );
              await client.sendMessage(
                from,
                "¿Deseas ajustar o exportar?\n1. Ajustar\n2. Exportar como .doc"
              );
            } catch (error) {
              handleError(from, error);
            }
          }, 3000);
        }
        break;

      case "agregar_otro_objetivo":
        clearTimeouts(from);
        setLongTimeouts(from);
        if (body === "1") {
          // Solo permitir agregar un segundo objetivo si aún no tiene 2
          if (
            userData[from].objetivosSeleccionados &&
            userData[from].objetivosSeleccionados.length < 2
          ) {
            conversationStates[from] = "esperando_objetivo";
            await client.sendMessage(
              from,
              "Selecciona el segundo objetivo:\n1. Generar leads\n2. Educar al cliente\n3. Posicionar producto\n4. Aumentar tráfico web"
            );
          } else {
            // Si ya tiene 2, continuar directamente
            userData[from].objetivo =
              userData[from].objetivosSeleccionados.join(" y ");
            userData[from].keyword = userData[from].campania;
            conversationStates[from] = "generando_blog";
            await client.sendMessage(
              from,
              "Generando tu blog, esto puede tardar unos segundos..."
            );
            setTimeout(async () => {
              try {
                const blog = generarPromptBlog(userData[from]);
                userData[from].blog = blog;
                conversationStates[from] = "ajustar_exportar";
                await client.sendMessage(
                  from,
                  `Aquí tienes tu blog (prompt generado):\n\n${blog}`
                );
                await client.sendMessage(
                  from,
                  "¿Deseas ajustar o exportar?\n1. Ajustar\n2. Exportar como .doc"
                );
              } catch (error) {
                handleError(from, error);
              }
            }, 3000);
          }
        } else if (body === "2" || /^no$/i.test(body)) {
          // Si elige no, continuar
          userData[from].objetivo =
            userData[from].objetivosSeleccionados.join(" y ");
          userData[from].keyword = userData[from].campania;
          conversationStates[from] = "generando_blog";
          await client.sendMessage(
            from,
            "Generando tu blog, esto puede tardar unos segundos..."
          );
          setTimeout(async () => {
            try {
              const blog = generarPromptBlog(userData[from]);
              userData[from].blog = blog;
              conversationStates[from] = "ajustar_exportar";
              await client.sendMessage(
                from,
                `Aquí tienes tu blog (prompt generado):\n\n${blog}`
              );
              await client.sendMessage(
                from,
                "¿Deseas ajustar o exportar?\n1. Ajustar\n2. Exportar como .doc"
              );
            } catch (error) {
              handleError(from, error);
            }
          }, 3000);
        } else {
          await client.sendMessage(
            from,
            "Por favor, responde con '1' para Sí o '2' para No."
          );
        }
        break;

      case "esperando_confirmacion":
        clearTimeouts(from);
        setLongTimeouts(from);
        if (body === "1" || /^s[ií]/i.test(body)) {
          conversationStates[from] = "generando_blog";
          await client.sendMessage(
            from,
            "Generando tu blog, esto puede tardar unos segundos..."
          );
          setTimeout(async () => {
            try {
              const blog = generarPromptBlog(userData[from]);
              userData[from].blog = blog;
              conversationStates[from] = "ajustar_exportar";
              await client.sendMessage(
                from,
                `Aquí tienes tu blog (prompt generado):\n\n${blog}`
              );
              await client.sendMessage(
                from,
                "¿Deseas ajustar o exportar?\n1. Ajustar\n2. Exportar como .doc"
              );
            } catch (error) {
              handleError(from, error);
            }
          }, 3000);
        } else {
          await client.sendMessage(
            from,
            "Operación cancelada. Escribe cualquier mensaje para iniciar de nuevo."
          );
          conversationStates[from] = "ended";
        }
        break;

      case "generando_blog":
        break;

      case "ajustar_exportar":
        clearTimeouts(from);
        setLongTimeouts(from);
        if (body === "1") {
          conversationStates[from] = "esperando_ajuste";
          await client.sendMessage(
            from,
            "¿Qué deseas ajustar del blog? (Ej: tono, CTA, estructura, etc.)"
          );
        } else if (body === "2") {
          conversationStates[from] = "exportando_doc";
          await client.sendMessage(from, "Exportando como .doc...");
          try {
            const doc = new Document({
              sections: [
                {
                  properties: {},
                  children: [
                    new Paragraph({
                      children: [new TextRun(userData[from].blog)],
                    }),
                  ],
                },
              ],
            });
            const buffer = await Packer.toBuffer(doc);

            // Enviar el documento directamente como archivo adjunto (sin guardarlo en disco)
            const media = new MessageMedia(
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              buffer.toString("base64"),
              "blog.docx"
            );
            await client.sendMessage(from, media, {
              sendMediaAsDocument: true,
              caption: "Aquí tienes tu blog en Word",
            });

            conversationStates[from] = "crear_otro";
            await client.sendMessage(
              from,
              "¿Deseas crear otro blog?\n1. Sí\n2. No\n3. Crear otro contenido"
            );
          } catch (error) {
            handleError(from, error);
          }
        } else {
          await client.sendMessage(
            from,
            "Por favor, responde con '1' para Ajustar o '2' para Exportar."
          );
        }
        break;

      case "esperando_ajuste":
        clearTimeouts(from);
        setLongTimeouts(from);
        userData[from].ajuste = body;
        conversationStates[from] = "generando_blog";
        await client.sendMessage(from, "Generando el blog ajustado...");
        setTimeout(async () => {
          try {
            // Aquí deberías ajustar el prompt y llamar a Python de nuevo
            const blog = generarPromptBlog(userData[from], body);
            userData[from].blog = blog;
            conversationStates[from] = "ajustar_exportar";
            await client.sendMessage(
              from,
              `Aquí tienes tu blog ajustado:\n\n${blog}`
            );
            // --- AJUSTE: enviar el menú de ajuste/exportar en un mensaje aparte ---
            await client.sendMessage(
              from,
              "¿Deseas ajustar o exportar?\n1. Ajustar\n2. Exportar como .doc"
            );
          } catch (error) {
            handleError(from, error);
          }
        }, 3000);
        break;

      case "exportando_doc":
        // Ignora mensajes mientras exporta
        break;

      case "crear_otro":
        clearTimeouts(from);
        setLongTimeouts(from);
        if (body === "1") {
          conversationStates[from] = "esperando_campania";
          userData[from] = {};
          await client.sendMessage(
            from,
            "¿Para qué campaña es el contenido?\n1. ColorVu3.0\n2. FlexVu\n3. AcuSeek\n3. Crear otro contenido"
          );
        } else if (body === "2") {
          await client.sendMessage(
            from,
            "¡Gracias por usar HikBot! Chat finalizado."
          );
          conversationStates[from] = "ended";
        } else if (body === "3") {
          // Aquí puedes agregar lógica para otro tipo de contenido si lo deseas
          await client.sendMessage(
            from,
            "Funcionalidad para crear otro tipo de contenido próximamente."
          );
          conversationStates[from] = "ended";
        } else {
          await client.sendMessage(
            from,
            "Por favor, responde con '1', '2' o '3'."
          );
        }
        break;

      case "ended":
        conversationStates[from] = "saludo";
        userData[from] = {};
        setLongTimeouts(from);
        await client.sendMessage(
          from,
          "¡Hola! 👋 Soy HikBot, ¿qué deseas crear?"
        );
        setTimeout(async () => {
          if (conversationStates[from] === "saludo") {
            conversationStates[from] = "esperando_tipo_contenido";
            await client.sendMessage(from, "Opciones:\n1. Blog");
          }
        }, 1000);
        break;

      default:
        await client.sendMessage(
          from,
          "No entendí tu mensaje. Escribe cualquier mensaje para iniciar de nuevo."
        );
        conversationStates[from] = "ended";
        break;
    }
  } catch (error) {
    handleError(from, error);
  }
});

// Prompt generator
function generarPromptBlog(data, ajuste = "") {
  return `
Eres un Especialista en SEO, Diseñador Web, Desarrollador Front-End y Redactor Persuasivo para sitios web.

Crea un blog que sea **atractivo, efectivo y fácil de usar**, asegurando que resuene con usuarios latinos del sector de seguridad. El contenido debe estar optimizado para SEO y enfocado en los principios 5S: Sabio, Selectivo, Sinergia, Simple y Seguro.

El texto debe generar urgencia, destacar los beneficios clave y guiar a los usuarios hacia una conversión inmediata. El llamado a la acción (CTA) debe ser claro, directo y emocionalmente persuasivo, transmitiendo alto valor y alto rendimiento de manera sencilla y segura.

Además, asegúrate de aplicar los principios de EEAT (Experiencia, Autoridad, Confianza y Transparencia) y utilizar el triángulo de la retórica (ethos, logos, pathos) para captar la atención, generar credibilidad y persuadir, manteniendo un tono profesional, agradable y tuteando.

${ajuste ? `\n---\nAjuste solicitado: ${ajuste}\n---\n` : ""}

---

**Especificaciones:**

- Tema del blog: **${data.campania || ""}**
- Público objetivo: **${data.publico || ""}**
- Objetivo del blog: **${data.objetivo || ""}**
- Palabra clave principal: **${data.keyword || ""}**
- Longitud estimada del blog: **${data.longitud || "800"}** palabras
- Caracteres aproximados: **${data.caracteres || "6000"}**

---

**Pautas de formato:**

1. **Meta Title:** Redacta un título breve y atractivo (máx. 60 caracteres) que incluya la palabra clave principal.
2. **Meta Description:** Crea una meta descripción clara y persuasiva (máx. 150 caracteres), empezando con la palabra clave.
3. **Estructura:** Respeta la estructura original del contenido si se indica (dejar títulos y descripciones existentes).
4. **Títulos:** Mejora los títulos y subtítulos, hazlos más impactantes y alineados con SEO.
5. **Cuerpo del contenido:** Enriquece el texto, aporta valor y utiliza la palabra clave 1-2 veces por cada 100 palabras, de forma natural.
6. **Estilo y tono:** Tono serio, profesional, con un lenguaje que inspire confianza y claridad. No uses emojis.

---

Crea el blog teniendo en cuenta que está dirigido a profesionales del sector de seguridad como **integradores, instaladores, distribuidores, revendedores, empresas y corporaciones**.

Longitud aproximada: ${data.longitud || "800"} palabras (${
    data.caracteres || "6000"
  } caracteres).
  `.trim();
}

client
  .initialize()
  .then(() => {
    console.log("Client initialized successfully");
  })
  .catch((err) => {
    console.error("Error initializing client", err);
  });
