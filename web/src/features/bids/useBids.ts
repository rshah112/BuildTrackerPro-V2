import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { Bid, BidPackage } from '../../domain/types'

export const useBidPackages = (projectId: string) => useRows<BidPackage>('bid_packages', { projectId })
export const useCreateBidPackage = () => useCreateRow<BidPackage>('bid_packages')
export const useUpdateBidPackage = () => useUpdateRow<BidPackage>('bid_packages')
export const useRemoveBidPackage = () => useRemoveRow('bid_packages')

export const useBids = (projectId: string) => useRows<Bid>('bids', { projectId })
export const useCreateBid = () => useCreateRow<Bid>('bids')
export const useUpdateBid = () => useUpdateRow<Bid>('bids')
export const useRemoveBid = () => useRemoveRow('bids')
