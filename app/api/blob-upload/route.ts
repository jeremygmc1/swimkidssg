import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

// Issues short-lived client tokens for direct browser → Vercel Blob uploads.
// The read-write token is custom-named, so it's passed explicitly.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.SWIMKIDSSG_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/png',
          'image/jpeg',
          'image/webp',
        ],
        maximumSizeInBytes: 8 * 1024 * 1024, // 8 MB
        addRandomSuffix: true, // unguessable URLs
      }),
      // No-op: the browser gets the URL from upload() directly. (This callback
      // also can't reach localhost during dev.)
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
