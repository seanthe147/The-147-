import { useQuery } from "@tanstack/react-query";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { getApiUrl } from "@/lib/query-client";

type MembershipSnapshot = {
  snookerRateDiscountPercent?: number;
} | null;

export function useSnookerMemberRate(): number {
  const { isAuthenticated, customer, getCustomerToken } = useCustomerAuth();
  const { data } = useQuery<MembershipSnapshot>({
    queryKey: ["/api/membership/my-subscription", customer?.id, "snooker-rate"],
    queryFn: async () => {
      const token = await getCustomerToken();
      if (!token) return null;
      const url = new URL("/api/membership/my-subscription", getApiUrl());
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  return data?.snookerRateDiscountPercent === 10 ? 10 : 0;
}
