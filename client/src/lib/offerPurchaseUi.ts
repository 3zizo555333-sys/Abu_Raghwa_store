export type PurchaseRequestStatus = "pending" | "approved" | "cancelled" | null | undefined;

export function shouldDisableOfferPurchaseButton(input: {
  isExpired: boolean;
  isSubmitting: boolean;
  requestId: string;
  isStatusFetching: boolean;
  status: PurchaseRequestStatus;
}) {
  const isLoadingExistingStatus = Boolean(input.requestId) && input.isStatusFetching && input.status == null;
  return input.isExpired || input.isSubmitting || input.status === "pending" || isLoadingExistingStatus;
}
