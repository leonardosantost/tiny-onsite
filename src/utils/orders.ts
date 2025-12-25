import { formatDateTime } from './date'

export function isPaidAndAuthorized(order: any) {
  const status = order?.status
  const isPaid = status === 'paid' || status === 'authorized'
  const payments = Array.isArray(order?.payments) ? order.payments : []
  const paymentOk = payments.length
    ? payments.some((payment: any) => ['approved', 'authorized'].includes(payment.status))
    : true
  return isPaid && paymentOk
}

export function isLabelPrinted(order: any) {
  const firstPrinted = order?.shipping_details?.date_first_printed
  if (firstPrinted) {
    return true
  }
  const substatus = order?.shipping_details?.substatus
  if (substatus === 'printed') {
    return true
  }
  if (substatus === 'ready_to_print') {
    return false
  }
  if (Array.isArray(substatus) && substatus.some((item) => String(item).includes('printed'))) {
    return true
  }
  const tags = Array.isArray(order?.tags) ? order.tags : []
  if (tags.some((tag: string) => ['printed', 'label_printed', 'shipment_printed'].includes(tag))) {
    return true
  }
  return false
}

export function isShipped(order: any) {
  const shippingStatus = order?.shipping_details?.status || order?.shipping?.status
  return ['shipped', 'delivered', 'handling'].includes(shippingStatus)
}

export function getOrderStatus(
  order: any,
  flags?: { collecting?: boolean; packed?: boolean; manifested?: boolean },
) {
  if (isShipped(order)) {
    return 'Enviado'
  }
  if (flags?.manifested) {
    return 'Manifestado'
  }
  if (flags?.packed) {
    return 'Embalado'
  }
  if (flags?.collecting) {
    return 'Coletando'
  }
  return 'Pronto para coletar'
}

export function getCutoff(order: any) {
  const expectedDate = order?.shipping_sla?.expected_date
  return expectedDate || ''
}

export function sortOrders(rows: any[]) {
  return rows.sort((a, b) => {
    const aIsShipped = a.status === 'Enviado'
    const bIsShipped = b.status === 'Enviado'

    if (aIsShipped && !bIsShipped) return 1
    if (!aIsShipped && bIsShipped) return -1

    if (!aIsShipped && !bIsShipped) {
      const aCutoff = Number.isNaN(a.cutoffTs) ? Infinity : a.cutoffTs
      const bCutoff = Number.isNaN(b.cutoffTs) ? Infinity : b.cutoffTs
      return aCutoff - bCutoff
    }

    const aDate = formatDateTime(a.orderDate)?.getTime() ?? 0
    const bDate = formatDateTime(b.orderDate)?.getTime() ?? 0
    return bDate - aDate
  })
}
