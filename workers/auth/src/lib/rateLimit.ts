export interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>
}

export async function allowRateLimit(binding: RateLimitBinding | undefined, key: string): Promise<boolean> {
  if (!binding) return false
  try {
    const result = await binding.limit({ key })
    return result.success === true
  } catch {
    return false
  }
}
