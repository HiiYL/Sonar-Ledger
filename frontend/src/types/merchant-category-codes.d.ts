declare module 'merchant-category-codes' {
  interface GroupInfo {
    type: string;
    description: string;
  }

  interface MccEntry {
    mcc: string;
    shortDescription: string;
    fullDescription: string;
    group?: GroupInfo;
  }

  export type { GroupInfo, MccEntry };

  export const mcc_with_groups_en: MccEntry[];
  export const mcc_with_groups: MccEntry[];
  export const mcc_with_groups_ru: MccEntry[];
  export const mcc_with_groups_uk: MccEntry[];

  export const mcc_without_groups: MccEntry[];
  export const mcc_without_groups_en: MccEntry[];
  export const mcc_without_groups_ru: MccEntry[];
  export const mcc_without_groups_uk: MccEntry[];
}
