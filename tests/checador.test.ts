import { describe, expect, it } from "vitest";
import {
  diaIso,
  diasLaborablesDesdeTexto,
  resumirAsistencia,
  type ChecadaEntrada,
} from "../src/lib/checador/jornada";
import {
  firmaTwilio,
  firmaValida,
  interpretarMensaje,
  normalizar,
  normalizarTelefono,
  respuestaTwiml,
} from "../src/lib/checador/whatsapp";

const HORARIO = {
  horaEntrada: "09:00",
  horaSalida: "18:00",
  toleranciaMinutos: 15,
  diasLaborables: [1, 2, 3, 4, 5],
};

function checada(fecha: string, tipo: ChecadaEntrada["tipo"]): ChecadaEntrada {
  return { tipo, ocurridoEn: new Date(`${fecha}Z`) };
}

function rango(inicio: string, fin: string) {
  return {
    inicio: new Date(`${inicio}T00:00:00.000Z`),
    fin: new Date(`${fin}T23:59:59.999Z`),
  };
}

describe("interpretación de mensajes de WhatsApp", () => {
  it("normaliza acentos, mayúsculas y signos", () => {
    expect(normalizar("¡Ya LLEGUÉ!")).toBe("ya llegue");
  });

  it("reconoce entrada y salida en distintas redacciones", () => {
    expect(interpretarMensaje("Entrada")).toEqual({ clase: "CHECADA", tipo: "ENTRADA" });
    expect(interpretarMensaje("ya llegue")).toEqual({ clase: "CHECADA", tipo: "ENTRADA" });
    expect(interpretarMensaje("SALIDA")).toEqual({ clase: "CHECADA", tipo: "SALIDA" });
    expect(interpretarMensaje("me voy")).toEqual({ clase: "CHECADA", tipo: "SALIDA" });
  });

  it("distingue el inicio del fin de comida", () => {
    expect(interpretarMensaje("comida")).toEqual({ clase: "CHECADA", tipo: "INICIO_COMIDA" });
    expect(interpretarMensaje("fin comida")).toEqual({ clase: "CHECADA", tipo: "FIN_COMIDA" });
    expect(interpretarMensaje("regreso")).toEqual({ clase: "CHECADA", tipo: "FIN_COMIDA" });
  });

  it("responde ayuda y marca lo que no entiende", () => {
    expect(interpretarMensaje("ayuda")).toEqual({ clase: "AYUDA" });
    expect(interpretarMensaje("hola que tal")).toEqual({ clase: "DESCONOCIDO" });
    expect(interpretarMensaje("   ")).toEqual({ clase: "DESCONOCIDO" });
  });

  it("normaliza el teléfono de Twilio a E.164", () => {
    expect(normalizarTelefono("whatsapp:+52 155 1234 5678")).toBe("+5215512345678");
    expect(normalizarTelefono("5215512345678")).toBe("+5215512345678");
  });

  it("escapa el TwiML de respuesta", () => {
    expect(respuestaTwiml("Entrada & <ok>")).toContain("Entrada &amp; &lt;ok&gt;");
  });
});

describe("firma de Twilio", () => {
  const token = "12345678901234567890123456789012";
  const url = "https://nomina.example.com/api/whatsapp/webhook";
  const parametros = { Body: "entrada", From: "whatsapp:+5215512345678", MessageSid: "SM1" };

  it("acepta la firma correcta", () => {
    const firma = firmaTwilio(token, url, parametros);
    expect(firmaValida(token, url, parametros, firma)).toBe(true);
  });

  it("rechaza cuerpo alterado, URL distinta y firma vacía", () => {
    const firma = firmaTwilio(token, url, parametros);
    expect(firmaValida(token, url, { ...parametros, Body: "salida" }, firma)).toBe(false);
    expect(firmaValida(token, `${url}/otro`, parametros, firma)).toBe(false);
    expect(firmaValida(token, url, parametros, "")).toBe(false);
  });

  it("no depende del orden de los parámetros", () => {
    const invertido = { MessageSid: "SM1", From: "whatsapp:+5215512345678", Body: "entrada" };
    expect(firmaTwilio(token, url, invertido)).toBe(firmaTwilio(token, url, parametros));
  });
});

describe("resumen de asistencia", () => {
  it("lee los días laborables desde el texto", () => {
    expect(diasLaborablesDesdeTexto("1,2,3,4,5")).toEqual([1, 2, 3, 4, 5]);
    expect(diasLaborablesDesdeTexto("1, 6 , 9, x")).toEqual([1, 6]);
    expect(diaIso(new Date("2025-01-05T10:00:00Z"))).toBe(7);
  });

  it("cuenta jornada completa sin extras ni retardos", () => {
    // Lunes 2025-01-06, 09:00 a 18:00 con una hora de comida descontada.
    const resumen = resumirAsistencia(
      [
        checada("2025-01-06T09:00:00", "ENTRADA"),
        checada("2025-01-06T14:00:00", "INICIO_COMIDA"),
        checada("2025-01-06T15:00:00", "FIN_COMIDA"),
        checada("2025-01-06T18:00:00", "SALIDA"),
      ],
      HORARIO,
      rango("2025-01-06", "2025-01-06"),
    );
    expect(resumen.dias[0].horasTrabajadas).toBe(8);
    expect(resumen.faltas).toBe(0);
    expect(resumen.retardos).toBe(0);
    expect(resumen.horasExtraDobles).toBe(0);
  });

  it("marca falta el día laborable sin entrada y no el fin de semana", () => {
    const resumen = resumirAsistencia([], HORARIO, rango("2025-01-06", "2025-01-12"));
    expect(resumen.faltas).toBe(5);
    expect(resumen.dias).toHaveLength(7);
  });

  it("aplica la tolerancia antes de contar retardo", () => {
    const conTolerancia = resumirAsistencia(
      [checada("2025-01-06T09:10:00", "ENTRADA"), checada("2025-01-06T18:00:00", "SALIDA")],
      HORARIO,
      rango("2025-01-06", "2025-01-06"),
    );
    expect(conTolerancia.retardos).toBe(0);

    const conRetardo = resumirAsistencia(
      [checada("2025-01-06T09:40:00", "ENTRADA"), checada("2025-01-06T18:00:00", "SALIDA")],
      HORARIO,
      rango("2025-01-06", "2025-01-06"),
    );
    expect(conRetardo.retardos).toBe(1);
    expect(conRetardo.dias[0].minutosRetardo).toBe(25);
  });

  it("paga al doble las primeras nueve horas extra de la semana (Art. 68 LFT)", () => {
    // Tres días con dos horas extra cada uno: seis horas, todas dobles.
    const checadas = ["2025-01-06", "2025-01-07", "2025-01-08"].flatMap((dia) => [
      checada(`${dia}T09:00:00`, "ENTRADA"),
      checada(`${dia}T20:00:00`, "SALIDA"),
    ]);
    const resumen = resumirAsistencia(checadas, HORARIO, rango("2025-01-06", "2025-01-12"));
    expect(resumen.horasExtraDobles).toBe(6);
    expect(resumen.horasExtraTriples).toBe(0);
  });

  it("paga al triple el excedente semanal de nueve horas", () => {
    // Cinco días con tres horas extra: 15 horas, nueve dobles y seis triples.
    const checadas = ["2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09", "2025-01-10"].flatMap(
      (dia) => [checada(`${dia}T09:00:00`, "ENTRADA"), checada(`${dia}T21:00:00`, "SALIDA")],
    );
    const resumen = resumirAsistencia(checadas, HORARIO, rango("2025-01-06", "2025-01-12"));
    expect(resumen.horasExtraDobles).toBe(9);
    expect(resumen.horasExtraTriples).toBe(6);
  });

  it("paga al triple lo que excede tres horas extra en un día (Art. 66 LFT)", () => {
    const resumen = resumirAsistencia(
      [checada("2025-01-06T09:00:00", "ENTRADA"), checada("2025-01-06T23:00:00", "SALIDA")],
      HORARIO,
      rango("2025-01-06", "2025-01-12"),
    );
    expect(resumen.dias[0].horasExtra).toBe(5);
    expect(resumen.horasExtraDobles).toBe(3);
    expect(resumen.horasExtraTriples).toBe(2);
  });

  it("reinicia el tope de nueve horas en cada semana", () => {
    const semana1 = ["2025-01-06", "2025-01-07", "2025-01-08"];
    const semana2 = ["2025-01-13", "2025-01-14", "2025-01-15"];
    const checadas = [...semana1, ...semana2].flatMap((dia) => [
      checada(`${dia}T09:00:00`, "ENTRADA"),
      checada(`${dia}T21:00:00`, "SALIDA"),
    ]);
    const resumen = resumirAsistencia(checadas, HORARIO, rango("2025-01-06", "2025-01-19"));
    // 9 horas por semana, todas dentro del tope diario y del semanal.
    expect(resumen.horasExtraDobles).toBe(18);
    expect(resumen.horasExtraTriples).toBe(0);
  });

  it("detecta domingo laborado y día de descanso trabajado", () => {
    const resumen = resumirAsistencia(
      [
        checada("2025-01-11T09:00:00", "ENTRADA"), // sábado
        checada("2025-01-11T14:00:00", "SALIDA"),
        checada("2025-01-12T09:00:00", "ENTRADA"), // domingo
        checada("2025-01-12T14:00:00", "SALIDA"),
      ],
      HORARIO,
      rango("2025-01-06", "2025-01-12"),
    );
    expect(resumen.domingosLaborados).toBe(1);
    expect(resumen.diasDescansoTrabajados).toBe(2);
    expect(resumen.faltas).toBe(5);
  });

  it("marca la jornada incompleta cuando falta la salida", () => {
    const resumen = resumirAsistencia(
      [checada("2025-01-06T09:00:00", "ENTRADA")],
      HORARIO,
      rango("2025-01-06", "2025-01-06"),
    );
    expect(resumen.jornadasIncompletas).toBe(1);
    expect(resumen.faltas).toBe(0);
    expect(resumen.dias[0].horasTrabajadas).toBe(0);
  });

  it("ignora las checadas fuera del rango del periodo", () => {
    const resumen = resumirAsistencia(
      [
        checada("2025-01-03T09:00:00", "ENTRADA"),
        checada("2025-01-06T09:00:00", "ENTRADA"),
        checada("2025-01-06T18:00:00", "SALIDA"),
      ],
      HORARIO,
      rango("2025-01-06", "2025-01-06"),
    );
    expect(resumen.dias).toHaveLength(1);
    expect(resumen.dias[0].horasTrabajadas).toBe(9);
  });
});
