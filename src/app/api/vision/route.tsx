export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = body?.message;

    if (!message)
      return new Response(
        JSON.stringify({ error: "No message provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );

    // Append instruction for concise response
    const shortMessage = `${message} describe a little about whats in the picture, and check its room, hall, Please respond in 1 short sentences, concise and easy to speak aloud.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ type: "text", text: shortMessage }] }],
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0.8,
        max_completion_tokens: 150, // short response
      }),
    });

    const data = await res.json();

    // Robust extraction of text
    let text = "No description available.";
    try {
      const choice = data?.choices?.[0];
      if (!choice) throw new Error("No choices in Groq response");

      // Handle array content
      if (choice.message && Array.isArray(choice.message.content)) {
        const t = choice.message.content.find((c: any) => c.type === "text");
        if (t?.text) text = t.text;
      }
      // Handle string content
      else if (choice.message && typeof choice.message.content === "string") {
        text = choice.message.content;
      }
      // Handle legacy format
      else if (choice.text) {
        text = choice.text;
      }
    } catch (e) {
      console.error("Error parsing Groq response:", e);
    }

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("GROQ ERROR:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
