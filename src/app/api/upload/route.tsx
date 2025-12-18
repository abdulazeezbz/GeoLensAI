// src/app/api/upload/route.ts
export const runtime = "edge"; // small image, can run in edge

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const image = body?.image; // base64 data URL

    if (!image) {
      return new Response(JSON.stringify({ error: "No image provided" }), { status: 400 });
    }

    // For prototyping, we just return a "fake URL" since Groq requires image_url
    // In production, upload to S3 / Cloudinary / Supabase storage
    const fakeUrl = "data:image/jpeg;base64," + image.split(",")[1];

    return new Response(JSON.stringify({ url: fakeUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
