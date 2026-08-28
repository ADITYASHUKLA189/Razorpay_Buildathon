import { NextResponse } from 'next/server';
import { generateBatch } from '@/lib/generator';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const seed = body.seed ? Number(body.seed) : undefined;
    const { batchId, seed: generatedSeed } = await generateBatch(seed);
    return NextResponse.json({ batchId, seed: generatedSeed });
  } catch (error) {
    console.error('Failed to generate batch:', error);
    return NextResponse.json({ error: 'Failed to generate batch' }, { status: 500 });
  }
}
