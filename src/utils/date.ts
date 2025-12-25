export function formatDateTime(value?: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function formatOrderDate(value?: string) {
  const date = formatDateTime(value)
  if (!date) return '-'
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const day = String(date.getDate()).padStart(2, '0')
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHour = ((hours + 11) % 12) + 1

  return `${day} ${month} ${year} ${displayHour}:${minutes} ${ampm}`
}

export function formatCutoffDisplay(value?: string) {
  const date = formatDateTime(value)
  if (!date) {
    return { relative: '-', label: '-' }
  }

  let cutoff = new Date(date)
  cutoff.setHours(11, 30, 0, 0)

  const diffMs = cutoff.getTime() - Date.now()
  const diffHours = Math.max(0, Math.ceil(diffMs / (60 * 60 * 1000)))

  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const day = String(cutoff.getDate()).padStart(2, '0')
  const month = months[cutoff.getMonth()]
  const year = cutoff.getFullYear()
  const hours = cutoff.getHours()
  const minutes = String(cutoff.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHour = ((hours + 11) % 12) + 1

  return {
    relative: `+${diffHours}h`,
    label: `${day} ${month} ${year} ${displayHour}:${minutes} ${ampm}`,
  }
}
