import { Prisma } from "@linchpin/db";

/**
 * SQL for a character's image where the character is aliased `c`: its own
 * image, else the image of the first-billed person playing it.
 */
export const CHARACTER_IMAGE = Prisma.sql`COALESCE(c."imageUrl", (
  SELECT p."imageUrl"
  FROM "PersonLink" pl
  JOIN "Person" p ON p.id = pl."personId"
  WHERE pl."characterId" = c.id
  ORDER BY pl."billingOrder" ASC NULLS LAST
  LIMIT 1
))`;
