import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeMutation } from "@/lib/mutation";
import { mailApi } from "./mailApi";
import type { Contact, ContactGroup } from "@/types";

export function useContacts(groupId?: string, query?: string) {
  return useQuery({
    queryKey: ["contacts", groupId ?? "__all__", query ?? ""],
    queryFn: async () => {
      const data = await mailApi.contactList(groupId, query);
      return (data ?? []) as Contact[];
    },
  });
}

export function useContactGroups() {
  return useQuery({
    queryKey: ["contact-groups"],
    queryFn: async () => {
      const data = await mailApi.contactGroupList();
      return (data ?? []) as ContactGroup[];
    },
  });
}

function useInvalidateContacts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["contacts"] });
    qc.invalidateQueries({ queryKey: ["contact-groups"] });
  };
}

export function useSaveContact() {
  const invalidate = useInvalidateContacts();
  return useSafeMutation({
    mutationFn: async (contact: Contact) => mailApi.contactSave(contact),
    onSuccess: invalidate,
  });
}

export function useDeleteContact() {
  const invalidate = useInvalidateContacts();
  return useSafeMutation({
    mutationFn: async (id: string) => mailApi.contactDelete(id),
    onSuccess: invalidate,
  });
}

export function useSaveContactGroup() {
  const invalidate = useInvalidateContacts();
  return useSafeMutation({
    mutationFn: async (input: { id?: string; name: string }) =>
      mailApi.contactGroupSave(input),
    onSuccess: invalidate,
  });
}

export function useDeleteContactGroup() {
  const invalidate = useInvalidateContacts();
  return useSafeMutation({
    mutationFn: async (id: string) => mailApi.contactGroupDelete(id),
    onSuccess: invalidate,
  });
}

export function useImportVcf() {
  const invalidate = useInvalidateContacts();
  return useSafeMutation({
    mutationFn: async (content: string) => mailApi.contactImportVcf(content),
    onSuccess: invalidate,
  });
}
