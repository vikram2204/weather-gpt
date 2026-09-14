export type IMDDistrict = {
  id: string;
  district: string;
  state: string;
  aliases: string[];
};

/*
 * Official IMD district object IDs.
 *
 * IMPORTANT:
 * Only add an ID after verifying it against
 * the official IMD source.
 *
 * Never invent or guess an obj_id.
 */

export const IMD_DISTRICTS: IMDDistrict[] = [
  /*
   * Hyderabad will be added here once its
   * official IMD obj_id is verified.
   *
   * Example structure:
   *
   * {
   *   id: "VERIFIED_ID",
   *   district: "Hyderabad",
   *   state: "Telangana",
   *   aliases: [
   *     "hyderabad",
   *     "hyderabad city"
   *   ]
   * }
   */
];

export function normalizeLocation(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/district/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

export function findIMDDistrict(
  location: string
) {
  const normalized = normalizeLocation(location);

  return IMD_DISTRICTS.find((district) => {
    const districtName = normalizeLocation(
      district.district
    );

    if (districtName === normalized) {
      return true;
    }

    return district.aliases.some(
      (alias) =>
        normalizeLocation(alias) === normalized
    );
  });
}