const syntheticEmailDomain = 'auth.banjaraconnect.invalid'

export function normalizeMobileNumber(input: string): string | null {
  const value = input.trim()
  if (!value || !/^\+?[\d\s().-]+$/.test(value)) return null

  let digits = value.replace(/\D/g, '')
  if (value.startsWith('00')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)

  if (digits.length === 10) digits = `91${digits}`
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null

  return `+${digits}`
}

export function mobileAuthEmail(normalizedMobileNumber: string): string {
  const digits = normalizedMobileNumber.slice(1)
  return `m${digits}@${syntheticEmailDomain}`
}

export function hideSyntheticAuthEmail(message: string): string {
  return message.replace(/m\d+@auth\.banjaraconnect\.invalid/gi, 'mobile-number account')
}
