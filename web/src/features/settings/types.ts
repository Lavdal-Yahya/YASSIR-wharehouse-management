export type Settings = {
  businessName: string;
  currency: string;
  receiptFooter: string;
  logoUrl: string;
};

export type SettingsPatch = Partial<{
  businessName: string;
  currency: string;
  receiptFooter: string;
}>;
