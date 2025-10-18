export function validateRequired(fields: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') {
      return `Missing required field: ${key}`
    }
    if (Array.isArray(value) && value.length === 0) {
      return `${key} cannot be empty`
    }
  }
  return null
}

export function validateAddress(address: string): boolean {
  if (!address) return false
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

export function compareAddresses(addr1?: string | null, addr2?: string | null): boolean {
  if (!addr1 || !addr2) return false
  return addr1.toLowerCase() === addr2.toLowerCase()
}

