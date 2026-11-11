-- CreateEnum
CREATE TYPE "WikiBasis" AS ENUM ('ARTICLE', 'REDIRECT');

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "wikiBasis" "WikiBasis";
