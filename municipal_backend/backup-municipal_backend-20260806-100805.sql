-- MySQL dump 10.13  Distrib 8.4.3, for Win64 (x86_64)
--
-- Host: localhost    Database: municipal_backend
-- ------------------------------------------------------
-- Server version	8.4.3

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `municipal_backend`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `municipal_backend` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `municipal_backend`;

--
-- Table structure for table `activationtokens`
--

DROP TABLE IF EXISTS `activationtokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activationtokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tokenHash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issuedToEmail` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiresAt` datetime NOT NULL,
  `usedAt` datetime DEFAULT NULL,
  `revokedAt` datetime DEFAULT NULL,
  `sentAt` datetime DEFAULT NULL,
  `firstAccessedAt` datetime DEFAULT NULL,
  `sendCount` int NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `userId` int DEFAULT NULL,
  `issuedByUserId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tokenHash` (`tokenHash`),
  UNIQUE KEY `tokenHash_2` (`tokenHash`),
  KEY `userId` (`userId`),
  KEY `issuedByUserId` (`issuedByUserId`),
  CONSTRAINT `activationtokens_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `activationtokens_ibfk_2` FOREIGN KEY (`issuedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `activationtokens_ibfk_3` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `activationtokens_ibfk_4` FOREIGN KEY (`issuedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activationtokens`
--

LOCK TABLES `activationtokens` WRITE;
/*!40000 ALTER TABLE `activationtokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `activationtokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `aipentries`
--

DROP TABLE IF EXISTS `aipentries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `aipentries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `expectedOutput` text COLLATE utf8mb4_unicode_ci,
  `expenseClass` enum('personalServices','mooe','capitalOutlay') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mooe',
  `fund` enum('generalFund','specialEducationFund','trustFund') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'generalFund',
  `papCode` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estimatedCost` decimal(15,2) NOT NULL,
  `startQuarter` enum('Q1','Q2','Q3','Q4') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Q1',
  `endQuarter` enum('Q1','Q2','Q3','Q4') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Q4',
  `status` enum('planned','dropped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planned',
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `investmentProgramId` int DEFAULT NULL,
  `developmentGoalId` int DEFAULT NULL,
  `implementingUnitId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `investmentProgramId` (`investmentProgramId`),
  KEY `developmentGoalId` (`developmentGoalId`),
  KEY `implementingUnitId` (`implementingUnitId`),
  KEY `aip_entries_status` (`status`),
  CONSTRAINT `aipentries_ibfk_1` FOREIGN KEY (`investmentProgramId`) REFERENCES `investmentprograms` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `aipentries_ibfk_2` FOREIGN KEY (`developmentGoalId`) REFERENCES `developmentgoals` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `aipentries_ibfk_3` FOREIGN KEY (`implementingUnitId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `aipentries`
--

LOCK TABLES `aipentries` WRITE;
/*!40000 ALTER TABLE `aipentries` DISABLE KEYS */;
/*!40000 ALTER TABLE `aipentries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `announcements`
--

DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('procurementOpportunity','newProject','systemUpdate','general') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `status` enum('draft','published','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `publishedAt` datetime DEFAULT NULL,
  `expiresAt` datetime DEFAULT NULL,
  `registrationDeadline` datetime DEFAULT NULL,
  `pinned` tinyint(1) NOT NULL DEFAULT '0',
  `referenceNo` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `appEntryId` int DEFAULT NULL,
  `createdByUserId` int DEFAULT NULL,
  `publishedByUserId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `appEntryId` (`appEntryId`),
  KEY `createdByUserId` (`createdByUserId`),
  KEY `publishedByUserId` (`publishedByUserId`),
  CONSTRAINT `announcements_ibfk_1` FOREIGN KEY (`appEntryId`) REFERENCES `appentries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `announcements_ibfk_2` FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `announcements_ibfk_3` FOREIGN KEY (`publishedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `announcements_ibfk_4` FOREIGN KEY (`appEntryId`) REFERENCES `appentries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `announcements_ibfk_5` FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `announcements_ibfk_6` FOREIGN KEY (`publishedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `announcements`
--

LOCK TABLES `announcements` WRITE;
/*!40000 ALTER TABLE `announcements` DISABLE KEYS */;
/*!40000 ALTER TABLE `announcements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `appentries`
--

DROP TABLE IF EXISTS `appentries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appentries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `projectTitle` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `mfoId` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `papCode` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uacsCode` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `procurementMode` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'competitiveBidding',
  `abc` decimal(15,2) NOT NULL,
  `unit` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `fundSource` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accountCode` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `targetStartQuarter` enum('Q1','Q2','Q3','Q4') COLLATE utf8mb4_unicode_ci NOT NULL,
  `targetCompletionQuarter` enum('Q1','Q2','Q3','Q4') COLLATE utf8mb4_unicode_ci NOT NULL,
  `justification` text COLLATE utf8mb4_unicode_ci,
  `fiscalYear` int NOT NULL,
  `status` enum('draft','pendingConsolidation','pendingBudgetCertification','pendingHopeApproval','approved','returned','locked','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `planStage` enum('ppmp','indicativeApp','updatedIndicativeApp','finalApp') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ppmp',
  `lockedAt` datetime DEFAULT NULL,
  `returnRemarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `implementingUnitId` int DEFAULT NULL,
  `appropriationId` int DEFAULT NULL,
  `createdById` int DEFAULT NULL,
  `planCycle` enum('indicative','final') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'final',
  `earlyProcurement` tinyint(1) NOT NULL DEFAULT '0',
  `bidEvaluationCriteria` text COLLATE utf8mb4_unicode_ci,
  `procurementStrategy` text COLLATE utf8mb4_unicode_ci,
  `modeRecommendedAt` datetime DEFAULT NULL,
  `modeRecommendationBasis` text COLLATE utf8mb4_unicode_ci,
  `postedAt` datetime DEFAULT NULL,
  `gppbSubmittedAt` datetime DEFAULT NULL,
  `revisionRemarks` text COLLATE utf8mb4_unicode_ci,
  `revisedAt` datetime DEFAULT NULL,
  `cancelledAt` datetime DEFAULT NULL,
  `aipEntryId` int DEFAULT NULL,
  `indicativeOriginId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `app_entries_fiscal_year_status` (`fiscalYear`,`status`),
  KEY `AppEntries_aipEntryId_foreign_idx` (`aipEntryId`),
  KEY `AppEntries_indicativeOriginId_foreign_idx` (`indicativeOriginId`),
  KEY `implementingUnitId` (`implementingUnitId`),
  KEY `appropriationId` (`appropriationId`),
  KEY `createdById` (`createdById`),
  CONSTRAINT `AppEntries_aipEntryId_foreign_idx` FOREIGN KEY (`aipEntryId`) REFERENCES `aipentries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appentries_ibfk_1` FOREIGN KEY (`implementingUnitId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appentries_ibfk_2` FOREIGN KEY (`appropriationId`) REFERENCES `appropriations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appentries_ibfk_3` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appentries_ibfk_4` FOREIGN KEY (`implementingUnitId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appentries_ibfk_5` FOREIGN KEY (`appropriationId`) REFERENCES `appropriations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appentries_ibfk_6` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AppEntries_indicativeOriginId_foreign_idx` FOREIGN KEY (`indicativeOriginId`) REFERENCES `appentries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appentries`
--

LOCK TABLES `appentries` WRITE;
/*!40000 ALTER TABLE `appentries` DISABLE KEYS */;
INSERT INTO `appentries` VALUES (13,'Supply and Delivery of Medical Equipment for the Municipal Health Office','Procurement of diagnostic and treatment equipment for the Rural Health Unit, including patient monitors, nebulisers, an ECG machine and examination furniture, to restore full service capacity at the main health station.',NULL,'PAP-HLTH-2024-011',NULL,'Goods','competitiveBidding',2850000.00,NULL,NULL,'General Fund — 20% Development Fund',NULL,'Q1','Q3',NULL,2026,'locked','finalApp','2026-01-29 03:20:00',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,11,7,'final',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(14,'Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','Concreting of 1.2 kilometres of farm-to-market road serving four upland barangays, including drainage canals and road shoulders, to reduce haulage cost for local produce.',NULL,'PAP-INFR-2024-004',NULL,'Infrastructure','competitiveBidding',8400000.00,NULL,NULL,'Local Development Fund',NULL,'Q1','Q2',NULL,2026,'locked','finalApp','2026-01-30 03:20:00',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,12,7,'final',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(15,'Construction of Barangay Malitbog Health Station','Construction of a one-storey barangay health station with consultation rooms, a birthing area, a pharmacy counter and a potable water system.',NULL,'PAP-HLTH-2024-019',NULL,'Infrastructure','competitiveBidding',4200000.00,NULL,NULL,'General Fund — 20% Development Fund',NULL,'Q2','Q4',NULL,2026,'locked','finalApp','2026-01-31 03:20:00',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',10,11,7,'final',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(16,'Supply and Delivery of Information Technology Equipment for Municipal Offices','Procurement of desktop computers, network switches and uninterruptible power supplies to replace end-of-life units across the Municipal Hall, in support of the digitalisation programme.',NULL,'PAP-ITO-2024-007',NULL,'Goods','competitiveBidding',1950000.00,NULL,NULL,'General Fund — MOOE',NULL,'Q3','Q4',NULL,2026,'locked','finalApp','2026-02-01 03:20:00',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,13,7,'final',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(17,'Procurement of Two (2) Units Garbage Compactor Truck','Acquisition of two garbage compactor trucks to expand solid waste collection coverage to the remaining eight barangays under the Ecological Solid Waste Management Plan.',NULL,'PAP-GSO-2024-002',NULL,'Goods','competitiveBidding',11500000.00,NULL,NULL,'General Fund — Capital Outlay',NULL,'Q4','Q4',NULL,2026,'locked','finalApp','2026-02-02 03:20:00',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',8,14,7,'final',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(18,'Construction of Municipal Evacuation Center','Construction of a disaster-resilient evacuation centre with a capacity of 500 persons, including sanitation facilities, a generator set and a rainwater collection system.',NULL,'PAP-INFR-2024-021',NULL,'Infrastructure','competitiveBidding',15750000.00,NULL,NULL,'Local Disaster Risk Reduction and Management Fund',NULL,'Q4','Q4',NULL,2026,'locked','finalApp','2026-02-03 03:20:00',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',9,12,7,'final',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `appentries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `appropriations`
--

DROP TABLE IF EXISTS `appropriations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appropriations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fiscalYear` int NOT NULL,
  `ordinanceNo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ordinanceDate` date DEFAULT NULL,
  `type` enum('annual','supplemental','continuing','reenacted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'annual',
  `fund` enum('generalFund','specialEducationFund','trustFund') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'generalFund',
  `expenseClass` enum('personalServices','mooe','capitalOutlay') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mooe',
  `papCode` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uacsCode` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `status` enum('draft','enacted','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `departmentId` int DEFAULT NULL,
  `recordedById` int DEFAULT NULL,
  `executiveBudgetId` int DEFAULT NULL,
  `budgetProposalLineId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `appropriations_fiscal_year_status` (`fiscalYear`,`status`),
  KEY `appropriations_fund_expense_class` (`fund`,`expenseClass`),
  KEY `departmentId` (`departmentId`),
  KEY `recordedById` (`recordedById`),
  KEY `appropriations_executive_budget_id` (`executiveBudgetId`),
  CONSTRAINT `appropriations_ibfk_1` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appropriations_ibfk_2` FOREIGN KEY (`recordedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appropriations_ibfk_3` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appropriations_ibfk_4` FOREIGN KEY (`recordedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appropriations`
--

LOCK TABLES `appropriations` WRITE;
/*!40000 ALTER TABLE `appropriations` DISABLE KEYS */;
INSERT INTO `appropriations` VALUES (11,2026,'Ord. No. 2026-01','2026-01-05','annual','generalFund','capitalOutlay','PAP-HLTH-CO-01','5-02-13-990','Health Facilities and Medical Equipment Outlay',9500000.00,'enacted',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,8,NULL,NULL),(12,2026,'Ord. No. 2026-01','2026-01-05','annual','generalFund','capitalOutlay','PAP-INFR-CO-01','5-02-13-060','Local Roads and Public Infrastructure Outlay',32000000.00,'enacted',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,8,NULL,NULL),(13,2026,'Ord. No. 2026-01','2026-01-05','annual','generalFund','mooe','PAP-ITO-MOOE-04','5-02-03-010','Information Technology Equipment and Systems',3400000.00,'enacted',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',11,8,NULL,NULL),(14,2026,'Ord. No. 2026-01','2026-01-05','annual','generalFund','capitalOutlay','PAP-GSO-CO-02','5-02-13-050','General Services Motor Vehicle and Equipment Outlay',14000000.00,'enacted',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',8,8,NULL,NULL),(15,2026,'Ord. No. 2026-01','2026-01-05','annual','specialEducationFund','mooe','PAP-SEF-MOOE-01','5-02-99-990','Special Education Fund — School Health Programme',2200000.00,'enacted',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,8,NULL,NULL);
/*!40000 ALTER TABLE `appropriations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auditlogs`
--

DROP TABLE IF EXISTS `auditlogs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditlogs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `actionType` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityRef` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entityId` int DEFAULT NULL,
  `beforeState` json DEFAULT NULL,
  `afterState` json DEFAULT NULL,
  `outcome` enum('success','denied','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'success',
  `summary` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ipAddress` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actorName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actorRole` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recordedAt` datetime NOT NULL,
  `sequence` int NOT NULL,
  `prevHash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actorId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sequence` (`sequence`),
  UNIQUE KEY `hash` (`hash`),
  UNIQUE KEY `sequence_2` (`sequence`),
  UNIQUE KEY `hash_2` (`hash`),
  KEY `audit_logs_entity_ref_entity_id` (`entityRef`,`entityId`),
  KEY `audit_logs_action_type` (`actionType`),
  KEY `actorId` (`actorId`),
  CONSTRAINT `auditlogs_ibfk_1` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `auditlogs_ibfk_2` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=265 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auditlogs`
--

LOCK TABLES `auditlogs` WRITE;
/*!40000 ALTER TABLE `auditlogs` DISABLE KEYS */;
INSERT INTO `auditlogs` VALUES (1,'app.transition','appEntry',1,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Health Office.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-08 01:15:00',1,'0000000000000000000000000000000000000000000000000000000000000000','49e0811479a59ea7ddddf1ac288ab0685858c2318d877bc624323d00ee86c04e',7),(2,'app.transition','appEntry',1,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-15 02:40:00',2,'49e0811479a59ea7ddddf1ac288ab0685858c2318d877bc624323d00ee86c04e','9d9a7a8c0954c030b8da740d9c6cfe2a9ffdf493cbf52933eb1812900d378579',5),(3,'app.transition','appEntry',1,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Health Facilities and Medical Equipment Outlay. Certified in the amount of ₱2,850,000.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-22 06:05:00',3,'9d9a7a8c0954c030b8da740d9c6cfe2a9ffdf493cbf52933eb1812900d378579','ed36c594d2b453683af834ff32e2c3970cf5ba66c1ed5e7cbafc9a3f0422733d',8),(4,'app.transition','appEntry',1,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-29 03:20:00',4,'ed36c594d2b453683af834ff32e2c3970cf5ba66c1ed5e7cbafc9a3f0422733d','83c202567ca9fbedb785de5c3542287970247cf0b3e18c416457f0884aad5a6e',2),(5,'pr.transition','pr',1,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0001: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-05 00:50:00',5,'83c202567ca9fbedb785de5c3542287970247cf0b3e18c416457f0884aad5a6e','54e22f051b949bd62914765193ace4eaee6d1683e06e480607cfd39c966bfa66',7),(6,'pr.transition','pr',1,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingSecretariatReview\", \"remarks\": \"ORS-2026-0001 issued against Ord. No. 2026-01. ₱2,850,000 obligated.\"}','success','PR-2026-0001: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-11 05:30:00',6,'54e22f051b949bd62914765193ace4eaee6d1683e06e480607cfd39c966bfa66','51a3ae64049cf457ed657b47a2dad1670c9571ad041804c82d282adcfde72dd5',8),(7,'pr.transition','pr',1,'{\"status\": \"pendingSecretariatReview\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Technical specifications reviewed and found complete.\"}','success','PR-2026-0001: review','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-02-17 07:10:00',7,'51a3ae64049cf457ed657b47a2dad1670c9571ad041804c82d282adcfde72dd5','6acab29540fde9b35de48e0375d1dcacee0d043585a78419f67d2c808a41b0ee',5),(8,'pr.transition','pr',1,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved for procurement through competitive bidding.\"}','success','PR-2026-0001: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-21 02:05:00',8,'6acab29540fde9b35de48e0375d1dcacee0d043585a78419f67d2c808a41b0ee','b96a8e10f3dad64093daf30804621e24f7ee2aa772091f02676ddc3123933c95',2),(9,'rfq.published','rfq',1,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱2,850,000.\"}','success','ITB-2026-001 advertised — Supply and Delivery of Medical Equipment for the Municipal Health Office','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-03 00:00:00',9,'b96a8e10f3dad64093daf30804621e24f7ee2aa772091f02676ddc3123933c95','535379f01641452118e8d830d67e0534aa98bbde6edf56928895de0aad6e9ab1',5),(10,'bids.opened','rfq',1,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-001','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-24 06:30:00',10,'535379f01641452118e8d830d67e0534aa98bbde6edf56928895de0aad6e9ab1','0b4ad176ac4bdea9a190b9e53361aa00e3ba0f8b08392a6dc5942e0a717024d1',3),(11,'evaluation.submitted','bid',1,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-001','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-02 07:45:00',11,'0b4ad176ac4bdea9a190b9e53361aa00e3ba0f8b08392a6dc5942e0a717024d1','c1f5329d17658ce099f53387514af492f989ee18c78dae331548dafcd7650de0',4),(12,'evaluation.closed','rfq',1,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-001','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-02 07:45:00',12,'c1f5329d17658ce099f53387514af492f989ee18c78dae331548dafcd7650de0','b88d585c712b94863d109969cefd331bd81e98a7123f397efa5db14b335f724e',3),(13,'award.recommended','award',1,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱2,703,500, ₱146,500 below the approved budget.\"}','success','BAC-RES-2026-0001 — award recommended to Medline Diagnostics Trading Corporation','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-09 03:00:00',13,'b88d585c712b94863d109969cefd331bd81e98a7123f397efa5db14b335f724e','4151f4f7ad2718b7836d3dccbf17c2526ff85f88578e5ad8750e450b1a5f2bc8',3),(14,'award.approved','award',1,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱2,703,500.\"}','success','NOA-2026-0001 issued to Medline Diagnostics Trading Corporation','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-16 01:30:00',14,'4151f4f7ad2718b7836d3dccbf17c2526ff85f88578e5ad8750e450b1a5f2bc8','dfc308b38c9114a9ee90dc45d0d2cc861fcc7d44049266fab466cdf9fc3414de',2),(15,'contract.signed','contract',1,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱2,703,500. Delivery due 2026-06-30.\"}','success','CON-2026-0001 signed with Medline Diagnostics Trading Corporation','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-28 06:20:00',15,'dfc308b38c9114a9ee90dc45d0d2cc861fcc7d44049266fab466cdf9fc3414de','1ef0bb1ddb5e9d8e13ba772d67fabf4f88f114d3b51b88c3cc7d70c82b4f356b',3),(16,'delivery.inspected','contract',1,NULL,'{\"status\": \"accepted\", \"remarks\": \"Inspected by the General Services Office and accepted in full. No deductions applied.\"}','success','Delivery inspected and accepted under CON-2026-0001','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-06-16 05:40:00',16,'1ef0bb1ddb5e9d8e13ba772d67fabf4f88f114d3b51b88c3cc7d70c82b4f356b','df09e7a3d33074045baaf2cd3630a378f2ac84de29dec89d6ce02cf062fe54f8',5),(17,'invoice.certified','invoice',1,NULL,'{\"status\": \"certified\", \"remarks\": \"Supporting documents complete. Certified for disbursement.\"}','success','INV-2026-0001 certified for payment','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-07-01 03:25:00',17,'df09e7a3d33074045baaf2cd3630a378f2ac84de29dec89d6ce02cf062fe54f8','7c3db7ee97e8693e07c73317cbfb2ecd2ad1504fd1cbbd81f79311b947ccb4aa',9),(18,'payment.released','payment',1,NULL,'{\"ewt\": 24138.39, \"gross\": 2703500, \"status\": \"released\", \"remarks\": \"Gross ₱2,703,500 less ₱144,830.35 in deductions — net ₱2,558,669.65 released by cheque LBP-480000.\", \"retention\": 0, \"netReleased\": 2558669.65, \"vatWithheld\": 120691.96}','success','DV-2026-0001 released to Medline Diagnostics Trading Corporation','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-07-09 06:50:00',18,'7c3db7ee97e8693e07c73317cbfb2ecd2ad1504fd1cbbd81f79311b947ccb4aa','df4f25e3e3fe87ec10bb3cfe3a6f2754e52ec75ab781b12983da0dd5ece31bf9',10),(19,'app.transition','appEntry',2,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Engineering Office.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-09 01:15:00',19,'df4f25e3e3fe87ec10bb3cfe3a6f2754e52ec75ab781b12983da0dd5ece31bf9','a98aa10e2bbdbd1b96c1c9a51ac7cbe46669dfcdce5c337c03303efefcc37f74',7),(20,'app.transition','appEntry',2,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-16 02:40:00',20,'a98aa10e2bbdbd1b96c1c9a51ac7cbe46669dfcdce5c337c03303efefcc37f74','a3a8af94d4d5ccd6cd1750cd01d1e7003229d08911c58f7300181416deb06df1',5),(21,'app.transition','appEntry',2,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Local Roads and Public Infrastructure Outlay. Certified in the amount of ₱8,400,000.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-23 06:05:00',21,'a3a8af94d4d5ccd6cd1750cd01d1e7003229d08911c58f7300181416deb06df1','100aeddc75cb2260f1d4d2eb8b48d15999532493eca0cb215300f41783615d3a',8),(22,'app.transition','appEntry',2,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-30 03:20:00',22,'100aeddc75cb2260f1d4d2eb8b48d15999532493eca0cb215300f41783615d3a','ceb21d528293198de9dc8270375443063d9208bb3b04d6abd40476c969fa0b5e',2),(23,'pr.transition','pr',2,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0002: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-06 00:50:00',23,'ceb21d528293198de9dc8270375443063d9208bb3b04d6abd40476c969fa0b5e','2d34d0413d26b6e71c9f60f2f2214741cb84381b43722770915811ab4a2fb6d5',7),(24,'pr.transition','pr',2,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingSecretariatReview\", \"remarks\": \"ORS-2026-0002 issued against Ord. No. 2026-01. ₱8,400,000 obligated.\"}','success','PR-2026-0002: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-12 05:30:00',24,'2d34d0413d26b6e71c9f60f2f2214741cb84381b43722770915811ab4a2fb6d5','74cfb9dc5e1d14a65d2750608eca3dc988383316a8d181821c70ee359d468ad2',8),(25,'pr.transition','pr',2,'{\"status\": \"pendingSecretariatReview\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Technical specifications reviewed and found complete.\"}','success','PR-2026-0002: review','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-02-18 07:10:00',25,'74cfb9dc5e1d14a65d2750608eca3dc988383316a8d181821c70ee359d468ad2','c23504b7cf9f498131cfd54a3e31ba74d9cb17331bcb5aaeb20b3dbf2a972a9f',5),(26,'pr.transition','pr',2,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved for procurement through competitive bidding.\"}','success','PR-2026-0002: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-22 02:05:00',26,'c23504b7cf9f498131cfd54a3e31ba74d9cb17331bcb5aaeb20b3dbf2a972a9f','ff36459e7f68b70b5494eaa4c3bce2451390c965f09a8699d16659c623dd39fe',2),(27,'rfq.published','rfq',2,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱8,400,000.\"}','success','ITB-2026-002 advertised — Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-04 00:00:00',27,'ff36459e7f68b70b5494eaa4c3bce2451390c965f09a8699d16659c623dd39fe','fc6dbf4e1438b9acdfa7d89b746039c66d92849912f1c5ac18ab7fe94e960501',5),(28,'bids.opened','rfq',2,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-002','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-25 06:30:00',28,'fc6dbf4e1438b9acdfa7d89b746039c66d92849912f1c5ac18ab7fe94e960501','35876f263339595fc86619f950401d2390401ddf5a01c619370c8ef69d8e5a57',3),(29,'evaluation.submitted','bid',4,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-002','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-03 07:45:00',29,'35876f263339595fc86619f950401d2390401ddf5a01c619370c8ef69d8e5a57','9fd9e81307ff024a6f9893e43855a2a417fb3ff722420c6333e191018471e9f9',4),(30,'evaluation.closed','rfq',2,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-002','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-03 07:45:00',30,'9fd9e81307ff024a6f9893e43855a2a417fb3ff722420c6333e191018471e9f9','72902d4efba4fd4595f49e963b1958bdfa3d30c2ebaa0289cb4873b2f492474f',3),(31,'award.recommended','award',2,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱8,127,000, ₱273,000 below the approved budget.\"}','success','BAC-RES-2026-0002 — award recommended to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-10 03:00:00',31,'72902d4efba4fd4595f49e963b1958bdfa3d30c2ebaa0289cb4873b2f492474f','0897bffc556a4461783bef76ed3b0f1f3602ca71e563935cdc3cb36c5b11deb1',3),(32,'award.approved','award',2,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱8,127,000.\"}','success','NOA-2026-0002 issued to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-17 01:30:00',32,'0897bffc556a4461783bef76ed3b0f1f3602ca71e563935cdc3cb36c5b11deb1','0b9fa16c9c74439f79ef0a6b9357c50ef1071161202f516d5d715e9526dfa8f4',2),(33,'contract.signed','contract',2,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱8,127,000. Delivery due 2026-07-01.\"}','success','CON-2026-0002 signed with Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-29 06:20:00',33,'0b9fa16c9c74439f79ef0a6b9357c50ef1071161202f516d5d715e9526dfa8f4','3bec2d5841c47008027bed7a00e80e7f5132797da4ef66013e16424cfbe4777d',3),(34,'delivery.inspected','contract',2,NULL,'{\"status\": \"accepted\", \"remarks\": \"Inspected by the General Services Office and accepted in full. No deductions applied.\"}','success','Delivery inspected and accepted under CON-2026-0002','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-06-17 05:40:00',34,'3bec2d5841c47008027bed7a00e80e7f5132797da4ef66013e16424cfbe4777d','cca1ae47c07e9466df749e2bdd1555427906b9f9a13c847042dee1bb2e4471a0',5),(35,'invoice.certified','invoice',2,NULL,'{\"status\": \"certified\", \"remarks\": \"Supporting documents complete. Certified for disbursement.\"}','success','INV-2026-0002 certified for payment','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-07-02 03:25:00',35,'cca1ae47c07e9466df749e2bdd1555427906b9f9a13c847042dee1bb2e4471a0','af7d60e82092f30214e3e27129d6a14c54de915b08c7b1decb5ad5a1b8589ba8',9),(36,'payment.released','payment',2,NULL,'{\"ewt\": 145125, \"gross\": 8127000, \"status\": \"released\", \"remarks\": \"Gross ₱8,127,000 less ₱1,320,637.5 in deductions — net ₱6,806,362.5 released by cheque LBP-480001.\", \"retention\": 812700, \"netReleased\": 6806362.5, \"vatWithheld\": 362812.5}','success','DV-2026-0002 released to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-07-10 06:50:00',36,'af7d60e82092f30214e3e27129d6a14c54de915b08c7b1decb5ad5a1b8589ba8','e0301569505130c90b80f3d5e7cb3b57f9492ad58e78e69ba4ec334ba979e539',10),(37,'app.transition','appEntry',3,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Health Office.\"}','success','Construction of Barangay Malitbog Health Station: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-10 01:15:00',37,'e0301569505130c90b80f3d5e7cb3b57f9492ad58e78e69ba4ec334ba979e539','05e31acf3b4ca970955b0be4a967b04adf7f53679dc07b7faec77ddc2f61072c',7),(38,'app.transition','appEntry',3,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Construction of Barangay Malitbog Health Station: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-17 02:40:00',38,'05e31acf3b4ca970955b0be4a967b04adf7f53679dc07b7faec77ddc2f61072c','ce508c1464666a1c37b5cd30bcabbe4d1eb72ebb4daa29ee484164172ef53deb',5),(39,'app.transition','appEntry',3,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Health Facilities and Medical Equipment Outlay. Certified in the amount of ₱4,200,000.\"}','success','Construction of Barangay Malitbog Health Station: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-24 06:05:00',39,'ce508c1464666a1c37b5cd30bcabbe4d1eb72ebb4daa29ee484164172ef53deb','d1463a909cb5e4ea0a0b6448ceb2524aa730319c7ebaaaa5a3cc6b45396d2a4e',8),(40,'app.transition','appEntry',3,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Construction of Barangay Malitbog Health Station: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-31 03:20:00',40,'d1463a909cb5e4ea0a0b6448ceb2524aa730319c7ebaaaa5a3cc6b45396d2a4e','98d3d25dc479c4bb89a3b1820e906e3c64762afad8fc50c5568f5df1eb538ed9',2),(41,'pr.transition','pr',3,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0003: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-07 00:50:00',41,'98d3d25dc479c4bb89a3b1820e906e3c64762afad8fc50c5568f5df1eb538ed9','cf15b579fb38170431dc1515708f3d94a2450935faf6c3d85e5b4cf8025fff9f',7),(42,'pr.transition','pr',3,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingSecretariatReview\", \"remarks\": \"ORS-2026-0003 issued against Ord. No. 2026-01. ₱4,200,000 obligated.\"}','success','PR-2026-0003: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-13 05:30:00',42,'cf15b579fb38170431dc1515708f3d94a2450935faf6c3d85e5b4cf8025fff9f','f8887493bc3db2f014eb4d6bdcd143491e09f8c86c8ca12c6a510a57d763aaaa',8),(43,'pr.transition','pr',3,'{\"status\": \"pendingSecretariatReview\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Technical specifications reviewed and found complete.\"}','success','PR-2026-0003: review','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-02-19 07:10:00',43,'f8887493bc3db2f014eb4d6bdcd143491e09f8c86c8ca12c6a510a57d763aaaa','84572ca81be5ed756b3130a6d28dda8c8b76e2e85513f30f19977381d19f45b2',5),(44,'pr.transition','pr',3,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved for procurement through competitive bidding.\"}','success','PR-2026-0003: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-23 02:05:00',44,'84572ca81be5ed756b3130a6d28dda8c8b76e2e85513f30f19977381d19f45b2','ff92fd010b375a9bdcc80efa75dd91f30925cbd2ccc37512817c9b6442452f87',2),(45,'rfq.published','rfq',3,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱4,200,000.\"}','success','ITB-2026-003 advertised — Construction of Barangay Malitbog Health Station','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-05 00:00:00',45,'ff92fd010b375a9bdcc80efa75dd91f30925cbd2ccc37512817c9b6442452f87','2e2b4c56db4aa34b7acd81a6541c79ea3df690a5c6a719cf054a800503e37794',5),(46,'bids.opened','rfq',3,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-003','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-26 06:30:00',46,'2e2b4c56db4aa34b7acd81a6541c79ea3df690a5c6a719cf054a800503e37794','0f713db4acab678256052c67b5503d66f2a16eb456a83c85f0397dd0cf87982f',3),(47,'evaluation.submitted','bid',7,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-003','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-04 07:45:00',47,'0f713db4acab678256052c67b5503d66f2a16eb456a83c85f0397dd0cf87982f','8ef36ef576562b9392e691dec9c2cc8c4593cdad4c9efb5abf372e8a6d71b1ac',4),(48,'evaluation.closed','rfq',3,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-003','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-04 07:45:00',48,'8ef36ef576562b9392e691dec9c2cc8c4593cdad4c9efb5abf372e8a6d71b1ac','a4476cca2d130f07d5a24a2639481680495da8939f0fe8757e420fa2e61c1fdc',3),(49,'award.recommended','award',3,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱4,085,000, ₱115,000 below the approved budget.\"}','success','BAC-RES-2026-0003 — award recommended to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-11 03:00:00',49,'a4476cca2d130f07d5a24a2639481680495da8939f0fe8757e420fa2e61c1fdc','b57f0b480d8ed7eeeb302599b8843b5d7251e827eba37033b6013c3f51be7d77',3),(50,'award.approved','award',3,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱4,085,000.\"}','success','NOA-2026-0003 issued to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-18 01:30:00',50,'b57f0b480d8ed7eeeb302599b8843b5d7251e827eba37033b6013c3f51be7d77','9e4f5c2fd08e661b4df4a8b636dbf16bb1b2dd7a9aee80c3831ebf3f1e8bec60',2),(51,'contract.signed','contract',3,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱4,085,000. Delivery due 2026-07-02.\"}','success','CON-2026-0003 signed with Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-30 06:20:00',51,'9e4f5c2fd08e661b4df4a8b636dbf16bb1b2dd7a9aee80c3831ebf3f1e8bec60','71157592e149f199e7b454157f2c9d3b6d771c2474d6bed0141fccb0de7f468d',3),(52,'app.transition','appEntry',4,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Information Technology Office.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-11 01:15:00',52,'71157592e149f199e7b454157f2c9d3b6d771c2474d6bed0141fccb0de7f468d','57340d92bd867abf553a883981fd829abcea4db530cc3ddd3703323ec1b37b0a',7),(53,'app.transition','appEntry',4,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-18 02:40:00',53,'57340d92bd867abf553a883981fd829abcea4db530cc3ddd3703323ec1b37b0a','55bde64a7cedd579f78c52c991f28eba1e54b6f71bcce5af37d82dd927ade4f0',5),(54,'app.transition','appEntry',4,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Information Technology Equipment and Systems. Certified in the amount of ₱1,950,000.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-25 06:05:00',54,'55bde64a7cedd579f78c52c991f28eba1e54b6f71bcce5af37d82dd927ade4f0','24a93108b9437f8ffc9003f3c0d8c418fc8d669af1137c470f7fbab9705fa1d8',8),(55,'app.transition','appEntry',4,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-01 03:20:00',55,'24a93108b9437f8ffc9003f3c0d8c418fc8d669af1137c470f7fbab9705fa1d8','453664382a44cc69dcd8daa827dd589342cd0e9f40864cd70d54357d690535e4',2),(56,'pr.transition','pr',4,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0004: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-08 00:50:00',56,'453664382a44cc69dcd8daa827dd589342cd0e9f40864cd70d54357d690535e4','068bdbc350ed4a95ccf27a07751fb4f3fd5480e8a083cf1adbb4b05d4bec69d4',7),(57,'pr.transition','pr',4,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingSecretariatReview\", \"remarks\": \"ORS-2026-0004 issued against Ord. No. 2026-01. ₱1,950,000 obligated.\"}','success','PR-2026-0004: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-14 05:30:00',57,'068bdbc350ed4a95ccf27a07751fb4f3fd5480e8a083cf1adbb4b05d4bec69d4','cbedf1c42f5591ea3c287bca4ec2a3f74621a82c40167c1440d1b45a209a9888',8),(58,'pr.transition','pr',4,'{\"status\": \"pendingSecretariatReview\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Technical specifications reviewed and found complete.\"}','success','PR-2026-0004: review','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-02-20 07:10:00',58,'cbedf1c42f5591ea3c287bca4ec2a3f74621a82c40167c1440d1b45a209a9888','69358b0073a6a7315360caf94ed386f99b18087046e2970d67404859042e036d',5),(59,'pr.transition','pr',4,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved for procurement through competitive bidding.\"}','success','PR-2026-0004: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-24 02:05:00',59,'69358b0073a6a7315360caf94ed386f99b18087046e2970d67404859042e036d','0ff931d53314727c3bee6add346c6a075f5abca32db334fe21c7be836b15b75e',2),(60,'rfq.published','rfq',4,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱1,950,000.\"}','success','ITB-2026-004 advertised — Supply and Delivery of Information Technology Equipment for Municipal Offices','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-07-27 00:00:00',60,'0ff931d53314727c3bee6add346c6a075f5abca32db334fe21c7be836b15b75e','1127f048b94bfa0806044874812fbcd932fc85a6639f4e19210b9c528486ce3a',5),(61,'app.transition','appEntry',5,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the General Services Office (GSO).\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-12 01:15:00',61,'1127f048b94bfa0806044874812fbcd932fc85a6639f4e19210b9c528486ce3a','7afc93fbcba3a4c9f5e5a9784b3b2260912b134f5ef7615638625ab2a3202daa',7),(62,'app.transition','appEntry',5,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-19 02:40:00',62,'7afc93fbcba3a4c9f5e5a9784b3b2260912b134f5ef7615638625ab2a3202daa','fb38ebdb8b766dd4f72a4e293a801c8407a0b412176b65421ce70e5f6b0f54fb',5),(63,'app.transition','appEntry',5,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — General Services Motor Vehicle and Equipment Outlay. Certified in the amount of ₱11,500,000.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-26 06:05:00',63,'fb38ebdb8b766dd4f72a4e293a801c8407a0b412176b65421ce70e5f6b0f54fb','e33a100e9f2d9f15473f1720db5376c76a76db38f896631c5b248eecccf17a3c',8),(64,'app.transition','appEntry',5,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-02 03:20:00',64,'e33a100e9f2d9f15473f1720db5376c76a76db38f896631c5b248eecccf17a3c','931c007acbeb654204777f9d7dce96d37215c3ab13055233dc41e6418720a9b6',2),(65,'app.transition','appEntry',6,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Engineering Office.\"}','success','Construction of Municipal Evacuation Center: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-13 01:15:00',65,'931c007acbeb654204777f9d7dce96d37215c3ab13055233dc41e6418720a9b6','6806f5a5a653c7ec6e4f15fb914b80e6ee29c371c40b82e6e58fb319d3c1892f',7),(66,'app.transition','appEntry',6,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Construction of Municipal Evacuation Center: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-20 02:40:00',66,'6806f5a5a653c7ec6e4f15fb914b80e6ee29c371c40b82e6e58fb319d3c1892f','630fc189187499721afd7272567665ce8329755c1c0015f757bca60d25b29af6',5),(67,'app.transition','appEntry',6,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Local Roads and Public Infrastructure Outlay. Certified in the amount of ₱15,750,000.\"}','success','Construction of Municipal Evacuation Center: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-27 06:05:00',67,'630fc189187499721afd7272567665ce8329755c1c0015f757bca60d25b29af6','31938a80b72a7c3cac3f7e3da47e1f8955fd5391e5216d08d15ca195118eb8fa',8),(68,'app.transition','appEntry',6,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Construction of Municipal Evacuation Center: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-03 03:20:00',68,'31938a80b72a7c3cac3f7e3da47e1f8955fd5391e5216d08d15ca195118eb8fa','02a0ea85a9f1027e4a8a8decc173a4ea7d387d75273931fc0b0c1e894f2ee459',2),(69,'auth.login.success','auth',7,NULL,NULL,'success','Dr. Anna Liza R. Cortez signed in','::1','Dr. Anna Liza R. Cortez','departmentRequester','2026-08-05 22:52:52',69,'02a0ea85a9f1027e4a8a8decc173a4ea7d387d75273931fc0b0c1e894f2ee459','f2947e548cc512000acdb1ff2f32079924b229e6d83e18484bcf4249f31f830c',7),(70,'app.transition','appEntry',7,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Health Office.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-08 01:15:00',70,'f2947e548cc512000acdb1ff2f32079924b229e6d83e18484bcf4249f31f830c','8b5118807b8ae4ee77ab2d64ebd115ed589aa311a7b90d070d2657c5ee7c0ae8',7),(71,'app.transition','appEntry',7,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-15 02:40:00',71,'8b5118807b8ae4ee77ab2d64ebd115ed589aa311a7b90d070d2657c5ee7c0ae8','80023772b1b1ce5a243904c3d123f4f4f17da647b16ec60c85b106c3ee3aaa4a',5),(72,'app.transition','appEntry',7,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Health Facilities and Medical Equipment Outlay. Certified in the amount of ₱2,850,000.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-22 06:05:00',72,'80023772b1b1ce5a243904c3d123f4f4f17da647b16ec60c85b106c3ee3aaa4a','6c15dd643f72264161f7beee5234857b6fff1aa44182256107ac76201cad0cec',8),(73,'app.transition','appEntry',7,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-29 03:20:00',73,'6c15dd643f72264161f7beee5234857b6fff1aa44182256107ac76201cad0cec','501d6902923fd8748ea8dbd1aeb3cd56fa27cf530f6fafc31928d212776e2547',2),(74,'pr.transition','pr',5,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0001: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-05 00:50:00',74,'501d6902923fd8748ea8dbd1aeb3cd56fa27cf530f6fafc31928d212776e2547','190c107585f0a156acc8a11eca34625fef6329cb8394768158d6df21130203ea',7),(75,'pr.transition','pr',5,'{\"status\": \"pendingDepartmentHeadEndorsement\"}','{\"status\": \"pendingCashCertification\", \"remarks\": \"Endorsed by the Head of Office.\"}','success','PR-2026-0001: endorse','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-08 01:40:00',75,'190c107585f0a156acc8a11eca34625fef6329cb8394768158d6df21130203ea','c0d4e772afa0378fd36c387311aa79997bddb9a9c2b8c26df759deff3afb27e6',3),(76,'pr.transition','pr',5,'{\"status\": \"pendingCashCertification\"}','{\"status\": \"pendingMayorApproval\", \"remarks\": \"Funds available in the General Fund. ₱2,850,000 certified.\"}','success','PR-2026-0001: certifyCash','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-02-11 05:30:00',76,'c0d4e772afa0378fd36c387311aa79997bddb9a9c2b8c26df759deff3afb27e6','e2a60371c334a8d9182421f00a8e0236ca07dc57752874230d09d66c55fa5f14',10),(77,'pr.transition','pr',5,'{\"status\": \"pendingMayorApproval\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Approved. Forwarded to the Budget Office for certification of appropriation.\"}','success','PR-2026-0001: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-15 02:05:00',77,'e2a60371c334a8d9182421f00a8e0236ca07dc57752874230d09d66c55fa5f14','987928a2af6e9e02ebb66cdc6944a9addf690e342f8470491b8b4f7440f576d3',2),(78,'pr.transition','pr',5,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingAccountantObligation\", \"remarks\": \"Appropriation certified against Ord. No. 2026-01. Referred to the Accountant for obligation.\"}','success','PR-2026-0001: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-17 07:10:00',78,'987928a2af6e9e02ebb66cdc6944a9addf690e342f8470491b8b4f7440f576d3','e37adde6f02c1d0eb7f38882c617a1114a3ae00161ef173a1c4a3a4483096b8f',8),(79,'pr.transition','pr',5,'{\"status\": \"pendingAccountantObligation\"}','{\"status\": \"pendingModeDetermination\", \"remarks\": \"ORS-2026-0001 issued against Ord. No. 2026-01. ₱2,850,000 obligated.\"}','success','PR-2026-0001: obligate','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-02-17 07:10:00',79,'e37adde6f02c1d0eb7f38882c617a1114a3ae00161ef173a1c4a3a4483096b8f','cdee3aac68f0fcb9059087da788fe1dcec681b2282f7e14ebb3c7877c4e7de65',9),(80,'pr.mode.determined','pr',5,'{\"status\": \"pendingModeDetermination\"}','{\"mode\": \"competitiveBidding\", \"status\": \"approved\", \"citation\": \"IRR Sec. 26\", \"suggestedMode\": \"competitiveBidding\", \"departedFromSuggestion\": false}','success','PR-2026-0001: mode determined — Competitive Bidding (IRR Sec. 26)','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-21 03:25:00',80,'cdee3aac68f0fcb9059087da788fe1dcec681b2282f7e14ebb3c7877c4e7de65','c558655146d717a3a78c827016e2013c059ad9ce9dd9e01dde49130de98d8a75',3),(81,'rfq.published','rfq',5,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱2,850,000.\"}','success','ITB-2026-001 advertised — Supply and Delivery of Medical Equipment for the Municipal Health Office','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-03 00:00:00',81,'c558655146d717a3a78c827016e2013c059ad9ce9dd9e01dde49130de98d8a75','78c01df71bc08c18e026fb5cdd3988b18b4ab6a13f9348dcdecdad1232848ec6',5),(82,'bids.opened','rfq',5,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-001','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-24 06:30:00',82,'78c01df71bc08c18e026fb5cdd3988b18b4ab6a13f9348dcdecdad1232848ec6','3da7c9db41a6bd5e03e08e47d62883346e3836a87e052e840d07f901b523371f',3),(83,'evaluation.submitted','bid',13,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-001','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-02 07:45:00',83,'3da7c9db41a6bd5e03e08e47d62883346e3836a87e052e840d07f901b523371f','f793e10beef36e018f76bb1aef540717c5fc4f259c93de024486b3e2d9ba8734',4),(84,'evaluation.closed','rfq',5,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-001','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-02 07:45:00',84,'f793e10beef36e018f76bb1aef540717c5fc4f259c93de024486b3e2d9ba8734','1b14443b041f658fc0b80c7a8640cf3d876425ae3757b70ec1606572d106cfdf',3),(85,'award.recommended','award',4,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱2,703,500, ₱146,500 below the approved budget.\"}','success','BAC-RES-2026-0001 — award recommended to Medline Diagnostics Trading Corporation','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-09 03:00:00',85,'1b14443b041f658fc0b80c7a8640cf3d876425ae3757b70ec1606572d106cfdf','c4061d49e53483757e42d065578380de56c31fbd2856f9474973e75631a8ef76',3),(86,'award.approved','award',4,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱2,703,500.\"}','success','NOA-2026-0001 issued to Medline Diagnostics Trading Corporation','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-16 01:30:00',86,'c4061d49e53483757e42d065578380de56c31fbd2856f9474973e75631a8ef76','77537e2376013b5af324f111db52e039879d0b03e6b5d4311e799b4449cbb087',2),(87,'contract.signed','contract',4,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱2,703,500. Delivery due 2026-06-30.\"}','success','CON-2026-0001 signed with Medline Diagnostics Trading Corporation','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-28 06:20:00',87,'77537e2376013b5af324f111db52e039879d0b03e6b5d4311e799b4449cbb087','dc174fd4dce3bb418f32f093dbda99da8fc9050cb5b64898701014139829d890',2),(88,'contract.ntp.issued','contract',4,NULL,'{\"contractDays\": 60, \"noticeToProceedAt\": \"2026-05-02T01:00:00.000Z\"}','success','Notice to Proceed issued on CON-2026-0001 — 60 calendar days','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-05-02 01:00:00',88,'dc174fd4dce3bb418f32f093dbda99da8fc9050cb5b64898701014139829d890','5d36ea54314044b558e4495cd99265eae41326d47aa1f6b7c352941df112ca25',2),(89,'delivery.inspected','contract',4,NULL,'{\"status\": \"accepted\", \"remarks\": \"Inspected by the General Services Office and accepted in full. No deductions applied.\"}','success','Delivery inspected and accepted under CON-2026-0001','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-06-16 05:40:00',89,'5d36ea54314044b558e4495cd99265eae41326d47aa1f6b7c352941df112ca25','a030fd11f611b8a53e24d28ba27ba63c7d607099a320ff1227c892ee4b1aca31',5),(90,'invoice.certified','invoice',3,NULL,'{\"status\": \"certified\", \"remarks\": \"Supporting documents complete. Certified for disbursement.\"}','success','INV-2026-0001 certified for payment','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-07-01 03:25:00',90,'a030fd11f611b8a53e24d28ba27ba63c7d607099a320ff1227c892ee4b1aca31','473aff62619d70110795f359a3b3f8e32a15cb31658aed890bc9b4baf94c645d',9),(91,'payment.released','payment',3,NULL,'{\"ewt\": 24138.39, \"gross\": 2703500, \"status\": \"released\", \"remarks\": \"Gross ₱2,703,500 less ₱144,830.35 in deductions — net ₱2,558,669.65 released by cheque LBP-480000.\", \"retention\": 0, \"netReleased\": 2558669.65, \"vatWithheld\": 120691.96}','success','DV-2026-0001 released to Medline Diagnostics Trading Corporation','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-07-09 06:50:00',91,'473aff62619d70110795f359a3b3f8e32a15cb31658aed890bc9b4baf94c645d','da2e55ac54740ecff0ca037be35cf4027406fb7d89594debb44c5d68c4b0d06e',10),(92,'app.transition','appEntry',8,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Engineering Office.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-09 01:15:00',92,'da2e55ac54740ecff0ca037be35cf4027406fb7d89594debb44c5d68c4b0d06e','9f74a238e5d7c2a923a19cfbdcb796b25d36e4d3f1f818887404a44d11502dad',7),(93,'app.transition','appEntry',8,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-16 02:40:00',93,'9f74a238e5d7c2a923a19cfbdcb796b25d36e4d3f1f818887404a44d11502dad','4c3a084038c61078457cd5c4eff40f773d297fb20e8f74c7e6f9ca478bebfdc6',5),(94,'app.transition','appEntry',8,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Local Roads and Public Infrastructure Outlay. Certified in the amount of ₱8,400,000.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-23 06:05:00',94,'4c3a084038c61078457cd5c4eff40f773d297fb20e8f74c7e6f9ca478bebfdc6','1e82114ed94dc1774ad0f3dee28a931a28bb6bede7cfcf60f2cbac08802645ac',8),(95,'app.transition','appEntry',8,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-30 03:20:00',95,'1e82114ed94dc1774ad0f3dee28a931a28bb6bede7cfcf60f2cbac08802645ac','60578916a6dc0c7ab15080fcad876759a9885e1d227edda0bd7d347da68d9f53',2),(96,'pr.transition','pr',6,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0002: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-06 00:50:00',96,'60578916a6dc0c7ab15080fcad876759a9885e1d227edda0bd7d347da68d9f53','2e4c4dee8dd282074930fb8c0237d8fa19ef72d96967cec2ec510c27552ebdd0',7),(97,'pr.transition','pr',6,'{\"status\": \"pendingDepartmentHeadEndorsement\"}','{\"status\": \"pendingCashCertification\", \"remarks\": \"Endorsed by the Head of Office.\"}','success','PR-2026-0002: endorse','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-09 01:40:00',97,'2e4c4dee8dd282074930fb8c0237d8fa19ef72d96967cec2ec510c27552ebdd0','c26c10d0ca4a074930b0bc4a89b466fad88b92dfa7b436f37b3b6867d6d81eb7',3),(98,'pr.transition','pr',6,'{\"status\": \"pendingCashCertification\"}','{\"status\": \"pendingMayorApproval\", \"remarks\": \"Funds available in the General Fund. ₱8,400,000 certified.\"}','success','PR-2026-0002: certifyCash','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-02-12 05:30:00',98,'c26c10d0ca4a074930b0bc4a89b466fad88b92dfa7b436f37b3b6867d6d81eb7','1f8e6678c772cca58d77bd2daeb9135daaa91ba6e671c6aa27aa6cfce351687a',10),(99,'pr.transition','pr',6,'{\"status\": \"pendingMayorApproval\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Approved. Forwarded to the Budget Office for certification of appropriation.\"}','success','PR-2026-0002: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-16 02:05:00',99,'1f8e6678c772cca58d77bd2daeb9135daaa91ba6e671c6aa27aa6cfce351687a','84d65406935ebd4ba219911390dc3667887db9bd631c6cfc8b4b6aa452efc225',2),(100,'pr.transition','pr',6,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingAccountantObligation\", \"remarks\": \"Appropriation certified against Ord. No. 2026-01. Referred to the Accountant for obligation.\"}','success','PR-2026-0002: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-18 07:10:00',100,'84d65406935ebd4ba219911390dc3667887db9bd631c6cfc8b4b6aa452efc225','b59b6fb9512d3bfa625a636cca0a067dfb99c345add247798d23339af894b655',8),(101,'pr.transition','pr',6,'{\"status\": \"pendingAccountantObligation\"}','{\"status\": \"pendingModeDetermination\", \"remarks\": \"ORS-2026-0002 issued against Ord. No. 2026-01. ₱8,400,000 obligated.\"}','success','PR-2026-0002: obligate','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-02-18 07:10:00',101,'b59b6fb9512d3bfa625a636cca0a067dfb99c345add247798d23339af894b655','e0c189f17b7d3af89ba824e612e672ab761aafc176a84c8c3c47b8b97c643775',9),(102,'pr.mode.determined','pr',6,'{\"status\": \"pendingModeDetermination\"}','{\"mode\": \"competitiveBidding\", \"status\": \"approved\", \"citation\": \"IRR Sec. 26\", \"suggestedMode\": \"competitiveBidding\", \"departedFromSuggestion\": false}','success','PR-2026-0002: mode determined — Competitive Bidding (IRR Sec. 26)','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-22 03:25:00',102,'e0c189f17b7d3af89ba824e612e672ab761aafc176a84c8c3c47b8b97c643775','9b6b47dc77d3705c69e107929e0d8bf0e96268adb1407168517488525ba49feb',3),(103,'rfq.published','rfq',6,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱8,400,000.\"}','success','ITB-2026-002 advertised — Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-04 00:00:00',103,'9b6b47dc77d3705c69e107929e0d8bf0e96268adb1407168517488525ba49feb','74e7280f5a388e2c4c71f5a4002c8c84a743597f6ff01d9d159b8612ac92179c',5),(104,'bids.opened','rfq',6,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-002','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-25 06:30:00',104,'74e7280f5a388e2c4c71f5a4002c8c84a743597f6ff01d9d159b8612ac92179c','c0ec648ed36ef3ac2dbd4d6116139e917a742e9aaa87cbe5a8d92b424b908c3b',3),(105,'evaluation.submitted','bid',16,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-002','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-03 07:45:00',105,'c0ec648ed36ef3ac2dbd4d6116139e917a742e9aaa87cbe5a8d92b424b908c3b','5c71ce2a477d754b38f02717554382c44525039ebb596659ce854ae40c5d3d6f',4),(106,'evaluation.closed','rfq',6,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-002','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-03 07:45:00',106,'5c71ce2a477d754b38f02717554382c44525039ebb596659ce854ae40c5d3d6f','22e86c8de634db15fcbe530a5f969a4741f3c74391a2f0e6c0fe654baa2ab9be',3),(107,'award.recommended','award',5,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱8,127,000, ₱273,000 below the approved budget.\"}','success','BAC-RES-2026-0002 — award recommended to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-10 03:00:00',107,'22e86c8de634db15fcbe530a5f969a4741f3c74391a2f0e6c0fe654baa2ab9be','2334dba30355b5af125bbbe6f04f6d43f82e799f887171fe0c3dcd1f302585c1',3),(108,'award.approved','award',5,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱8,127,000.\"}','success','NOA-2026-0002 issued to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-17 01:30:00',108,'2334dba30355b5af125bbbe6f04f6d43f82e799f887171fe0c3dcd1f302585c1','62097efdc879d4f80e7e76b34228937df6538e0dbd549e8af607c620e2dd21d5',2),(109,'contract.signed','contract',5,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱8,127,000. Delivery due 2026-07-01.\"}','success','CON-2026-0002 signed with Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-29 06:20:00',109,'62097efdc879d4f80e7e76b34228937df6538e0dbd549e8af607c620e2dd21d5','205888ef252da07b5ede8acfc29472f4da71c0a266ccec7d831c39f04b03616f',2),(110,'contract.ntp.issued','contract',5,NULL,'{\"contractDays\": 120, \"noticeToProceedAt\": \"2026-05-03T01:00:00.000Z\"}','success','Notice to Proceed issued on CON-2026-0002 — 120 calendar days','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-05-03 01:00:00',110,'205888ef252da07b5ede8acfc29472f4da71c0a266ccec7d831c39f04b03616f','3e9a46dbb3fb111eb0f4f6050b1206476912068477f57c7d9040360ae445086d',2),(111,'delivery.inspected','contract',5,NULL,'{\"status\": \"accepted\", \"remarks\": \"Inspected by the General Services Office and accepted in full. No deductions applied.\"}','success','Delivery inspected and accepted under CON-2026-0002','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-06-17 05:40:00',111,'3e9a46dbb3fb111eb0f4f6050b1206476912068477f57c7d9040360ae445086d','509e283e3451d22e43f81aaa5fc87e323545c68b921a4534e573f52db5281501',5),(112,'invoice.certified','invoice',4,NULL,'{\"status\": \"certified\", \"remarks\": \"Supporting documents complete. Certified for disbursement.\"}','success','INV-2026-0002 certified for payment','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-07-02 03:25:00',112,'509e283e3451d22e43f81aaa5fc87e323545c68b921a4534e573f52db5281501','aca555113b01380149f7373c4cd94b2e211176cacc9dfbe5243b325aa8da275c',9),(113,'payment.released','payment',4,NULL,'{\"ewt\": 145125, \"gross\": 8127000, \"status\": \"released\", \"remarks\": \"Gross ₱8,127,000 less ₱1,320,637.5 in deductions — net ₱6,806,362.5 released by cheque LBP-480001.\", \"retention\": 812700, \"netReleased\": 6806362.5, \"vatWithheld\": 362812.5}','success','DV-2026-0002 released to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-07-10 06:50:00',113,'aca555113b01380149f7373c4cd94b2e211176cacc9dfbe5243b325aa8da275c','3c5948d95ceebe79553b161832a0783c1440a924c4f2138edb973b21209c4b67',10),(114,'app.transition','appEntry',9,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Health Office.\"}','success','Construction of Barangay Malitbog Health Station: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-10 01:15:00',114,'3c5948d95ceebe79553b161832a0783c1440a924c4f2138edb973b21209c4b67','25b6da2503399b24e85bcdec13512055d7cd63742d3865a96dbab42699f0046a',7),(115,'app.transition','appEntry',9,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Construction of Barangay Malitbog Health Station: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-17 02:40:00',115,'25b6da2503399b24e85bcdec13512055d7cd63742d3865a96dbab42699f0046a','69114e7e65d1d9c0f3528e92692035607a381dbeda07d94af764e003b4377e5e',5),(116,'app.transition','appEntry',9,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Health Facilities and Medical Equipment Outlay. Certified in the amount of ₱4,200,000.\"}','success','Construction of Barangay Malitbog Health Station: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-24 06:05:00',116,'69114e7e65d1d9c0f3528e92692035607a381dbeda07d94af764e003b4377e5e','e35f0a4a2c956caecfcff527ada2a2ea112cabbb8766cb47b62bf5cf957e8d00',8),(117,'app.transition','appEntry',9,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Construction of Barangay Malitbog Health Station: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-31 03:20:00',117,'e35f0a4a2c956caecfcff527ada2a2ea112cabbb8766cb47b62bf5cf957e8d00','e3fed8b715e0f6a94779f37288e68c521f531772c47c1502ce48f69937e0817d',2),(118,'pr.transition','pr',7,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0003: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-07 00:50:00',118,'e3fed8b715e0f6a94779f37288e68c521f531772c47c1502ce48f69937e0817d','c4b7b1dcf527578842a388400d8318e9aa6e9c81cc8a186c332d01523aa3faa9',7),(119,'pr.transition','pr',7,'{\"status\": \"pendingDepartmentHeadEndorsement\"}','{\"status\": \"pendingCashCertification\", \"remarks\": \"Endorsed by the Head of Office.\"}','success','PR-2026-0003: endorse','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-10 01:40:00',119,'c4b7b1dcf527578842a388400d8318e9aa6e9c81cc8a186c332d01523aa3faa9','918a0e2764b4d3b0ff91efce2226572978ea529a3e8ffc157d09df455d746aa3',3),(120,'pr.transition','pr',7,'{\"status\": \"pendingCashCertification\"}','{\"status\": \"pendingMayorApproval\", \"remarks\": \"Funds available in the General Fund. ₱4,200,000 certified.\"}','success','PR-2026-0003: certifyCash','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-02-13 05:30:00',120,'918a0e2764b4d3b0ff91efce2226572978ea529a3e8ffc157d09df455d746aa3','e876de24d07202b2c7251d4709a889c0753340864c9801fa6245712a56ebfcd5',10),(121,'pr.transition','pr',7,'{\"status\": \"pendingMayorApproval\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Approved. Forwarded to the Budget Office for certification of appropriation.\"}','success','PR-2026-0003: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-17 02:05:00',121,'e876de24d07202b2c7251d4709a889c0753340864c9801fa6245712a56ebfcd5','6d3a646473d5a79b566cbb5b0317e0f8bbc76c7d7337e93e8bcf21d513a241ce',2),(122,'pr.transition','pr',7,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingAccountantObligation\", \"remarks\": \"Appropriation certified against Ord. No. 2026-01. Referred to the Accountant for obligation.\"}','success','PR-2026-0003: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-19 07:10:00',122,'6d3a646473d5a79b566cbb5b0317e0f8bbc76c7d7337e93e8bcf21d513a241ce','0c6f03bd3502d1be5421f9976b9b650f494344c14a3286e5ade70b2328db62ec',8),(123,'pr.transition','pr',7,'{\"status\": \"pendingAccountantObligation\"}','{\"status\": \"pendingModeDetermination\", \"remarks\": \"ORS-2026-0003 issued against Ord. No. 2026-01. ₱4,200,000 obligated.\"}','success','PR-2026-0003: obligate','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-02-19 07:10:00',123,'0c6f03bd3502d1be5421f9976b9b650f494344c14a3286e5ade70b2328db62ec','998ef777ef3e25c0559562fd2b5fb2e7fefa25e11f252a05916296a3866a50c0',9),(124,'pr.mode.determined','pr',7,'{\"status\": \"pendingModeDetermination\"}','{\"mode\": \"competitiveBidding\", \"status\": \"approved\", \"citation\": \"IRR Sec. 26\", \"suggestedMode\": \"competitiveBidding\", \"departedFromSuggestion\": false}','success','PR-2026-0003: mode determined — Competitive Bidding (IRR Sec. 26)','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-23 03:25:00',124,'998ef777ef3e25c0559562fd2b5fb2e7fefa25e11f252a05916296a3866a50c0','343fdae79380207e431d077b409a60bfd60a718a86237c42f9f9ab50ee1aa68e',3),(125,'rfq.published','rfq',7,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱4,200,000.\"}','success','ITB-2026-003 advertised — Construction of Barangay Malitbog Health Station','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-05 00:00:00',125,'343fdae79380207e431d077b409a60bfd60a718a86237c42f9f9ab50ee1aa68e','71f3dd73b2de41b96dbf62b0d223539b2027de65860b4978bd79f9d177869bd4',5),(126,'bids.opened','rfq',7,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-003','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-26 06:30:00',126,'71f3dd73b2de41b96dbf62b0d223539b2027de65860b4978bd79f9d177869bd4','4f8e4a7256b822a57eb39720cdf6703592c5de5d0490f4083e8e7189273cf24e',3),(127,'evaluation.submitted','bid',19,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-003','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-04 07:45:00',127,'4f8e4a7256b822a57eb39720cdf6703592c5de5d0490f4083e8e7189273cf24e','e3bb8056323e4adbe3652629f633df73be4a8ba64e9535dde4ba67f85ee828b2',4),(128,'evaluation.closed','rfq',7,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-003','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-04 07:45:00',128,'e3bb8056323e4adbe3652629f633df73be4a8ba64e9535dde4ba67f85ee828b2','288f9d93611288fb61f15c306a55eccad2aeadd7e79819e1b96ff4a0e2e7e2a4',3),(129,'award.recommended','award',6,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱4,085,000, ₱115,000 below the approved budget.\"}','success','BAC-RES-2026-0003 — award recommended to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-11 03:00:00',129,'288f9d93611288fb61f15c306a55eccad2aeadd7e79819e1b96ff4a0e2e7e2a4','cc54479fe3fcbda18789b6a010060c9d34ceddeabac452a62dfe7f86f00e8db0',3),(130,'award.approved','award',6,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱4,085,000.\"}','success','NOA-2026-0003 issued to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-18 01:30:00',130,'cc54479fe3fcbda18789b6a010060c9d34ceddeabac452a62dfe7f86f00e8db0','f72b9c0426ba7689327c15efba006e8a5e5d7b0b74415c648294ed25c6c8b406',2),(131,'contract.signed','contract',6,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱4,085,000. Delivery due 2026-07-02.\"}','success','CON-2026-0003 signed with Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-30 06:20:00',131,'f72b9c0426ba7689327c15efba006e8a5e5d7b0b74415c648294ed25c6c8b406','ae8c4f0a89f761cdd3f24eeab232689556a320b649bc4638933a147ad4f633c3',2),(132,'contract.ntp.issued','contract',6,NULL,'{\"contractDays\": 120, \"noticeToProceedAt\": \"2026-05-04T01:00:00.000Z\"}','success','Notice to Proceed issued on CON-2026-0003 — 120 calendar days','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-05-04 01:00:00',132,'ae8c4f0a89f761cdd3f24eeab232689556a320b649bc4638933a147ad4f633c3','f5741f91f573868642f239293d0369783d3c2546627d159aff7a1356c923ac4c',2),(133,'app.transition','appEntry',10,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Information Technology Office.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-11 01:15:00',133,'f5741f91f573868642f239293d0369783d3c2546627d159aff7a1356c923ac4c','abdc82ec2d735466dcff0caa276b75137774a431522430b8dc934283ce762280',7),(134,'app.transition','appEntry',10,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-18 02:40:00',134,'abdc82ec2d735466dcff0caa276b75137774a431522430b8dc934283ce762280','d36d45f0dd1ecebac2b733be2100dc9ab87b7aa2dda8d5df97e3cfba426255dc',5),(135,'app.transition','appEntry',10,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Information Technology Equipment and Systems. Certified in the amount of ₱1,950,000.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-25 06:05:00',135,'d36d45f0dd1ecebac2b733be2100dc9ab87b7aa2dda8d5df97e3cfba426255dc','03513753b400f1aeaef880aa8a207a86ffd9a0cd765c0e7e853bb2df9c251b7b',8),(136,'app.transition','appEntry',10,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-01 03:20:00',136,'03513753b400f1aeaef880aa8a207a86ffd9a0cd765c0e7e853bb2df9c251b7b','86390d991ef7fff9e6cd654b8d69902adee072d959e08226d56f8e29eda43bc4',2),(137,'pr.transition','pr',8,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0004: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-08 00:50:00',137,'86390d991ef7fff9e6cd654b8d69902adee072d959e08226d56f8e29eda43bc4','2b726e5df6636273bd6936154cf0ab95a677dd82bdd8e1c90974be225036c829',7),(138,'pr.transition','pr',8,'{\"status\": \"pendingDepartmentHeadEndorsement\"}','{\"status\": \"pendingCashCertification\", \"remarks\": \"Endorsed by the Head of Office.\"}','success','PR-2026-0004: endorse','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-11 01:40:00',138,'2b726e5df6636273bd6936154cf0ab95a677dd82bdd8e1c90974be225036c829','e18df3d75999775f42c1f1763c8c9ac6c96c40825b680fe4f0fa588f14b5c17a',3),(139,'pr.transition','pr',8,'{\"status\": \"pendingCashCertification\"}','{\"status\": \"pendingMayorApproval\", \"remarks\": \"Funds available in the General Fund. ₱1,950,000 certified.\"}','success','PR-2026-0004: certifyCash','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-02-14 05:30:00',139,'e18df3d75999775f42c1f1763c8c9ac6c96c40825b680fe4f0fa588f14b5c17a','1134e56be412e4d3d38c074cbbfbaf90c4e271e583b0a9b9e2c7fca8f0222ce0',10),(140,'pr.transition','pr',8,'{\"status\": \"pendingMayorApproval\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Approved. Forwarded to the Budget Office for certification of appropriation.\"}','success','PR-2026-0004: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-18 02:05:00',140,'1134e56be412e4d3d38c074cbbfbaf90c4e271e583b0a9b9e2c7fca8f0222ce0','b18f1f8bc9808f460af24f38bd326682ff39230d343e2d85d58a4ffc31e37770',2),(141,'pr.transition','pr',8,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingAccountantObligation\", \"remarks\": \"Appropriation certified against Ord. No. 2026-01. Referred to the Accountant for obligation.\"}','success','PR-2026-0004: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-20 07:10:00',141,'b18f1f8bc9808f460af24f38bd326682ff39230d343e2d85d58a4ffc31e37770','f5c3580f48bc27373f7e850657645f93f485c30dcc1babd51195984626192867',8),(142,'pr.transition','pr',8,'{\"status\": \"pendingAccountantObligation\"}','{\"status\": \"pendingModeDetermination\", \"remarks\": \"ORS-2026-0004 issued against Ord. No. 2026-01. ₱1,950,000 obligated.\"}','success','PR-2026-0004: obligate','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-02-20 07:10:00',142,'f5c3580f48bc27373f7e850657645f93f485c30dcc1babd51195984626192867','876685b152e1a297ee7f24d930a9fbcb22c32fe580486fc430aa9b00b13df99a',9),(143,'pr.mode.determined','pr',8,'{\"status\": \"pendingModeDetermination\"}','{\"mode\": \"competitiveBidding\", \"status\": \"approved\", \"citation\": \"IRR Sec. 26\", \"suggestedMode\": \"competitiveBidding\", \"departedFromSuggestion\": false}','success','PR-2026-0004: mode determined — Competitive Bidding (IRR Sec. 26)','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-24 03:25:00',143,'876685b152e1a297ee7f24d930a9fbcb22c32fe580486fc430aa9b00b13df99a','7634e703b992a8bfcacf5a6e9cec5d00c336f1d53ba81a1c2044f5e9c3a598aa',3),(144,'rfq.published','rfq',8,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱1,950,000.\"}','success','ITB-2026-004 advertised — Supply and Delivery of Information Technology Equipment for Municipal Offices','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-07-28 00:00:00',144,'7634e703b992a8bfcacf5a6e9cec5d00c336f1d53ba81a1c2044f5e9c3a598aa','9361c4ad27a2a34168da96a867d36fe4639cb1de22e587ba98466d51815b8f0d',5),(145,'app.transition','appEntry',11,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the General Services Office (GSO).\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-12 01:15:00',145,'9361c4ad27a2a34168da96a867d36fe4639cb1de22e587ba98466d51815b8f0d','bf8178863b90050e3297148dff67bb3aa6564eb106ba4271f02452651660049f',7),(146,'app.transition','appEntry',11,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-19 02:40:00',146,'bf8178863b90050e3297148dff67bb3aa6564eb106ba4271f02452651660049f','74655e11360d2039fad46776365cac9c01db12e3734d4739394e19c167431c1e',5),(147,'app.transition','appEntry',11,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — General Services Motor Vehicle and Equipment Outlay. Certified in the amount of ₱11,500,000.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-26 06:05:00',147,'74655e11360d2039fad46776365cac9c01db12e3734d4739394e19c167431c1e','dd45d3dcec064bc8995e320b15d0ba76e3f5e3c89e3c1f801a8599c5473cc9e7',8),(148,'app.transition','appEntry',11,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-02 03:20:00',148,'dd45d3dcec064bc8995e320b15d0ba76e3f5e3c89e3c1f801a8599c5473cc9e7','2123dfabd7f886810928a0286d81a80194c3b879a97d57606fa75cee10221e5c',2),(149,'app.transition','appEntry',12,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Engineering Office.\"}','success','Construction of Municipal Evacuation Center: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-13 01:15:00',149,'2123dfabd7f886810928a0286d81a80194c3b879a97d57606fa75cee10221e5c','5b70e77b5f386d4d9dbb31366b6929eeff0ef01e7e778990b2b07fafff85b9d2',7),(150,'app.transition','appEntry',12,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Construction of Municipal Evacuation Center: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-20 02:40:00',150,'5b70e77b5f386d4d9dbb31366b6929eeff0ef01e7e778990b2b07fafff85b9d2','84b98d131b93d7838af00dc94cd2db9f8b424f1979652ae4e89087df9d625d26',5),(151,'app.transition','appEntry',12,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Local Roads and Public Infrastructure Outlay. Certified in the amount of ₱15,750,000.\"}','success','Construction of Municipal Evacuation Center: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-27 06:05:00',151,'84b98d131b93d7838af00dc94cd2db9f8b424f1979652ae4e89087df9d625d26','718921960bbfb2a96c4da39f8f9a6239c0e9619f0eaeb1290ca0ed920cfb1fa3',8),(152,'app.transition','appEntry',12,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Construction of Municipal Evacuation Center: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-03 03:20:00',152,'718921960bbfb2a96c4da39f8f9a6239c0e9619f0eaeb1290ca0ed920cfb1fa3','6ee623e8f773370b6a6618f98f58df01310a4976c5ca05a99f6963a450dfe165',2),(153,'auth.login.success','auth',7,NULL,NULL,'success','Dr. Anna Liza R. Cortez signed in','::1','Dr. Anna Liza R. Cortez','departmentRequester','2026-08-06 01:22:34',153,'6ee623e8f773370b6a6618f98f58df01310a4976c5ca05a99f6963a450dfe165','5a329c655942c9feaa734846a43b374b3ef6a570326e75c489df02426b46345a',7),(154,'auth.login.success','auth',1,NULL,NULL,'success','Joel R. Fabricante signed in','::1','Joel R. Fabricante','systemAdministrator','2026-08-06 01:22:51',154,'5a329c655942c9feaa734846a43b374b3ef6a570326e75c489df02426b46345a','0c6242949c92ba77420f8305e695b56e0c5b56dae4798385085e8324fde4a61a',1),(155,'auth.login.success','auth',2,NULL,NULL,'success','Hon. Teresita M. Alcantara signed in','::1','Hon. Teresita M. Alcantara','hope','2026-08-06 01:22:52',155,'0c6242949c92ba77420f8305e695b56e0c5b56dae4798385085e8324fde4a61a','acca949b1f1f02ab60efe780ea18a4c291510e7253a2f6916b149e4b3230ab3f',2),(156,'auth.login.success','auth',3,NULL,NULL,'success','Atty. Rodel V. Manalo signed in','::1','Atty. Rodel V. Manalo','bacChairperson','2026-08-06 01:22:52',156,'acca949b1f1f02ab60efe780ea18a4c291510e7253a2f6916b149e4b3230ab3f','26fbcc8fab3b5b213537b39db708d222fe8b04c3bad301b4d623d900ee5ea529',3),(157,'auth.login.success','auth',14,NULL,NULL,'success','BAC Vice-Chairperson signed in','::1','BAC Vice-Chairperson','bacViceChairperson','2026-08-06 01:22:53',157,'26fbcc8fab3b5b213537b39db708d222fe8b04c3bad301b4d623d900ee5ea529','f72baeb62f7780b41e6e611103f3f44e8d592550d0fd6243e05cab9384911561',14),(158,'auth.login.success','auth',4,NULL,NULL,'success','Engr. Cristina P. Bautista signed in','::1','Engr. Cristina P. Bautista','bacMember','2026-08-06 01:22:54',158,'f72baeb62f7780b41e6e611103f3f44e8d592550d0fd6243e05cab9384911561','0a2aea317876a45476b4a72c5339b094dcbdabc9581363e3b849cac80f473218',4),(159,'auth.login.success','auth',5,NULL,NULL,'success','Marilou D. Ceniza signed in','::1','Marilou D. Ceniza','bacSecretariat','2026-08-06 01:22:54',159,'0a2aea317876a45476b4a72c5339b094dcbdabc9581363e3b849cac80f473218','90510a900a04abc7140fea713bec613e6abf7557cbabfa8d9852141afb532101',5),(160,'auth.login.success','auth',6,NULL,NULL,'success','Engr. Noel A. Villamor signed in','::1','Engr. Noel A. Villamor','twgMember','2026-08-06 01:22:55',160,'90510a900a04abc7140fea713bec613e6abf7557cbabfa8d9852141afb532101','f264918fe2b21fbe7f660b726409296e510a8db61bdeb621a0edb09870ef51f7',6),(161,'auth.login.success','auth',7,NULL,NULL,'success','Dr. Anna Liza R. Cortez signed in','::1','Dr. Anna Liza R. Cortez','departmentRequester','2026-08-06 01:22:55',161,'f264918fe2b21fbe7f660b726409296e510a8db61bdeb621a0edb09870ef51f7','ea2d4633f8500c3448b6a5ad6c9c881cac34d20ba84cc80e17de6f6a1a9397d9',7),(162,'auth.login.success','auth',8,NULL,NULL,'success','Elena S. Villaflor signed in','::1','Elena S. Villaflor','budgetOfficer','2026-08-06 01:22:56',162,'ea2d4633f8500c3448b6a5ad6c9c881cac34d20ba84cc80e17de6f6a1a9397d9','5da389aff63939c6d8cbfbf035595e91d74db68a02af15977494c402d931ec0b',8),(163,'auth.login.success','auth',15,NULL,NULL,'success','Municipal Planning and Development Coordinator signed in','::1','Municipal Planning and Development Coordinator','planningOfficer','2026-08-06 01:22:57',163,'5da389aff63939c6d8cbfbf035595e91d74db68a02af15977494c402d931ec0b','5294cf8ace0cd2c83bf355cec66b007f11fa44b94edc0bd39c3cefbe97fab005',15),(164,'auth.login.success','auth',16,NULL,NULL,'success','Secretary to the Sangguniang Bayan signed in','::1','Secretary to the Sangguniang Bayan','sanggunianSecretary','2026-08-06 01:22:57',164,'5294cf8ace0cd2c83bf355cec66b007f11fa44b94edc0bd39c3cefbe97fab005','00a99c4fa2878da2c1d4876de5d447a3764c581868b0527ced6441e2d070a528',16),(165,'auth.login.success','auth',9,NULL,NULL,'success','Ramon T. Delos Reyes signed in','::1','Ramon T. Delos Reyes','municipalAccountant','2026-08-06 01:22:58',165,'00a99c4fa2878da2c1d4876de5d447a3764c581868b0527ced6441e2d070a528','90089767fbdabd8dd39c8f268e5a4959d105075f6325e37e8ce30b5c19a3bae3',9),(166,'auth.login.success','auth',10,NULL,NULL,'success','Lorna F. Aguinaldo signed in','::1','Lorna F. Aguinaldo','municipalTreasurer','2026-08-06 01:22:59',166,'90089767fbdabd8dd39c8f268e5a4959d105075f6325e37e8ce30b5c19a3bae3','b9707323abc00cb6f4ff5f865e17149d1b31074356c0a75ce3bab63fec9efeee',10),(167,'auth.login.success','auth',11,NULL,NULL,'success','Medline Diagnostics Trading Corporation signed in','::1','Medline Diagnostics Trading Corporation','vendor','2026-08-06 01:22:59',167,'b9707323abc00cb6f4ff5f865e17149d1b31074356c0a75ce3bab63fec9efeee','b460b0fce58082b2f531d4a1b247c36f4120db0d1a25684627e3e7fd3e2032a5',11),(168,'auth.login.success','auth',12,NULL,NULL,'success','Fr. Antonio L. Perez signed in','::1','Fr. Antonio L. Perez','observer','2026-08-06 01:23:00',168,'b460b0fce58082b2f531d4a1b247c36f4120db0d1a25684627e3e7fd3e2032a5','0362b182eb38ea1606231d698fbc27ad2f7cbc510821190735287462464cf460',12),(169,'auth.login.success','auth',13,NULL,NULL,'success','Grace B. Mendoza signed in','::1','Grace B. Mendoza','internalAuditor','2026-08-06 01:23:01',169,'0362b182eb38ea1606231d698fbc27ad2f7cbc510821190735287462464cf460','ac879fef7fd4c8622f2fa946fdbe2c41d13fb6611bcea87fd17bba6d2dd9d2a1',13),(170,'observers.invited','rfq',5,NULL,'{\"stage\": \"bidEvaluation\", \"noticeDays\": 7, \"scheduledAt\": \"2026-08-14T01:25:28.291623Z\", \"organizations\": [\"Commission on Audit — Resident Auditor, Municipal Office\", \"National Constructors Association of the Philippines, Inc. (NACAP)\", \"Municipal Federation of Peoples Organizations\"]}','success','3 observer(s) invited to Bid evaluation for ITB-2026-001 (7 days\' notice)','::1','Marilou D. Ceniza','bacSecretariat','2026-08-06 01:25:28',170,'ac879fef7fd4c8622f2fa946fdbe2c41d13fb6611bcea87fd17bba6d2dd9d2a1','89843d501011f10d45f301f255dad898e1a20eed1d2100156ac3764ba6567c57',5),(171,'app.transition','appEntry',13,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Health Office.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-08 01:15:00',171,'89843d501011f10d45f301f255dad898e1a20eed1d2100156ac3764ba6567c57','f96301c6fdbc40f8c8f387b55ad9c933ce72f0143e1bafcafbad4755f14fbb0c',7),(172,'app.transition','appEntry',13,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-15 02:40:00',172,'f96301c6fdbc40f8c8f387b55ad9c933ce72f0143e1bafcafbad4755f14fbb0c','9d78549a1a6249f5dee05765141e2f4365114a892aa4794652c6ddbdc629ed51',5),(173,'app.transition','appEntry',13,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Health Facilities and Medical Equipment Outlay. Certified in the amount of ₱2,850,000.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-22 06:05:00',173,'9d78549a1a6249f5dee05765141e2f4365114a892aa4794652c6ddbdc629ed51','b65fa1b91e9298fcc9d053252b156df727a43a34f694a381436d08bb718178f2',8),(174,'app.transition','appEntry',13,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-29 03:20:00',174,'b65fa1b91e9298fcc9d053252b156df727a43a34f694a381436d08bb718178f2','2e8c988e1f743121d48a6f10a6a350ba0e117558914874bd0aff2e96363726ad',2),(175,'pr.transition','pr',9,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0001: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-05 00:50:00',175,'2e8c988e1f743121d48a6f10a6a350ba0e117558914874bd0aff2e96363726ad','0875675da5125a51dba20d4adaa81cd43c15b9e2e1668ad2bff954b2b5550544',7),(176,'pr.transition','pr',9,'{\"status\": \"pendingDepartmentHeadEndorsement\"}','{\"status\": \"pendingCashCertification\", \"remarks\": \"Endorsed by the Head of Office.\"}','success','PR-2026-0001: endorse','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-08 01:40:00',176,'0875675da5125a51dba20d4adaa81cd43c15b9e2e1668ad2bff954b2b5550544','b1a389b47c527249034cfc4072fa7f43e45d498e968a1940551661fe353c81d6',3),(177,'pr.transition','pr',9,'{\"status\": \"pendingCashCertification\"}','{\"status\": \"pendingMayorApproval\", \"remarks\": \"Funds available in the General Fund. ₱2,850,000 certified.\"}','success','PR-2026-0001: certifyCash','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-02-11 05:30:00',177,'b1a389b47c527249034cfc4072fa7f43e45d498e968a1940551661fe353c81d6','387c22eac864d3cee1e74e0169d178c6730fc7786fa06b960dcd816888190de4',10),(178,'pr.transition','pr',9,'{\"status\": \"pendingMayorApproval\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Approved. Forwarded to the Budget Office for certification of appropriation.\"}','success','PR-2026-0001: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-15 02:05:00',178,'387c22eac864d3cee1e74e0169d178c6730fc7786fa06b960dcd816888190de4','c3963d7bc204eccc83d061ee223ea5c35a3931c242d54b19a0ca85423ce0e105',2),(179,'pr.transition','pr',9,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingAccountantObligation\", \"remarks\": \"Appropriation certified against Ord. No. 2026-01. Referred to the Accountant for obligation.\"}','success','PR-2026-0001: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-17 07:10:00',179,'c3963d7bc204eccc83d061ee223ea5c35a3931c242d54b19a0ca85423ce0e105','8664e2a297e433af25fa7cdec91451cf109a138311304072bb32f748b6133f8f',8),(180,'pr.transition','pr',9,'{\"status\": \"pendingAccountantObligation\"}','{\"status\": \"pendingModeDetermination\", \"remarks\": \"ORS-2026-0001 issued against Ord. No. 2026-01. ₱2,850,000 obligated.\"}','success','PR-2026-0001: obligate','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-02-17 07:10:00',180,'8664e2a297e433af25fa7cdec91451cf109a138311304072bb32f748b6133f8f','7ba4c8266a636b9df21ff5c06b069577c45429b27860a651eb2ff8d108c2ae37',9),(181,'pr.mode.determined','pr',9,'{\"status\": \"pendingModeDetermination\"}','{\"mode\": \"competitiveBidding\", \"status\": \"approved\", \"citation\": \"IRR Sec. 26\", \"suggestedMode\": \"competitiveBidding\", \"departedFromSuggestion\": false}','success','PR-2026-0001: mode determined — Competitive Bidding (IRR Sec. 26)','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-21 03:25:00',181,'7ba4c8266a636b9df21ff5c06b069577c45429b27860a651eb2ff8d108c2ae37','9d9afcebcf2db957700daf651dbb5b5e15f9b81356467dfcbe4c09a182ffd757',3),(182,'rfq.published','rfq',9,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱2,850,000.\"}','success','ITB-2026-001 advertised — Supply and Delivery of Medical Equipment for the Municipal Health Office','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-03 00:00:00',182,'9d9afcebcf2db957700daf651dbb5b5e15f9b81356467dfcbe4c09a182ffd757','35010eedd71da46f5ed4a754152e6e2cb208a297e6288d80a18d9cef6802091d',5),(183,'bids.opened','rfq',9,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-001','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-24 06:30:00',183,'35010eedd71da46f5ed4a754152e6e2cb208a297e6288d80a18d9cef6802091d','7cbb8c35086a63e196cd9e9edbb62934c0ecddc0bccd416b3ad2ee6764788555',3),(184,'evaluation.submitted','bid',25,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-001','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-02 07:45:00',184,'7cbb8c35086a63e196cd9e9edbb62934c0ecddc0bccd416b3ad2ee6764788555','d17c3e216aa9b1c34285c568646cb59a15f679e74dea82cabbd49f604048cd71',4),(185,'evaluation.closed','rfq',9,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-001','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-02 07:45:00',185,'d17c3e216aa9b1c34285c568646cb59a15f679e74dea82cabbd49f604048cd71','36825a58517bbd8bedce2f9a29990edbb5c295690802a84fb6aef4e6d085a05a',3),(186,'award.recommended','award',7,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱2,703,500, ₱146,500 below the approved budget.\"}','success','BAC-RES-2026-0001 — award recommended to Medline Diagnostics Trading Corporation','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-09 03:00:00',186,'36825a58517bbd8bedce2f9a29990edbb5c295690802a84fb6aef4e6d085a05a','ff7524b66780e2e327bde197b9ac7c9e786aecbfaa78678a609cbf2d94264733',3),(187,'award.approved','award',7,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱2,703,500.\"}','success','NOA-2026-0001 issued to Medline Diagnostics Trading Corporation','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-16 01:30:00',187,'ff7524b66780e2e327bde197b9ac7c9e786aecbfaa78678a609cbf2d94264733','9912c7500e94d07cd10c64d71760a2bd154b2583feb4fea4eb42fed6700a0a52',2),(188,'contract.signed','contract',7,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱2,703,500. Delivery due 2026-06-30.\"}','success','CON-2026-0001 signed with Medline Diagnostics Trading Corporation','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-28 06:20:00',188,'9912c7500e94d07cd10c64d71760a2bd154b2583feb4fea4eb42fed6700a0a52','3346b68bd1536237fc09fa1bcaddfc658b64690c48a1e1ccb7040ae8b94b8dec',2),(189,'contract.ntp.issued','contract',7,NULL,'{\"contractDays\": 60, \"noticeToProceedAt\": \"2026-05-02T01:00:00.000Z\"}','success','Notice to Proceed issued on CON-2026-0001 — 60 calendar days','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-05-02 01:00:00',189,'3346b68bd1536237fc09fa1bcaddfc658b64690c48a1e1ccb7040ae8b94b8dec','e9dc6f536d3fc7258a761150ad7e3a244e2d42596ba3ba3c785eaf482fc55b7a',2),(190,'delivery.inspected','contract',7,NULL,'{\"status\": \"accepted\", \"remarks\": \"Inspected by the General Services Office and accepted in full. No deductions applied.\"}','success','Delivery inspected and accepted under CON-2026-0001','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-06-16 05:40:00',190,'e9dc6f536d3fc7258a761150ad7e3a244e2d42596ba3ba3c785eaf482fc55b7a','1a87e36b055fd4bb678b819870717e878b6c76466b561fa4b4f0621686528e11',5),(191,'invoice.certified','invoice',5,NULL,'{\"status\": \"certified\", \"remarks\": \"Supporting documents complete. Certified for disbursement.\"}','success','INV-2026-0001 certified for payment','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-07-01 03:25:00',191,'1a87e36b055fd4bb678b819870717e878b6c76466b561fa4b4f0621686528e11','8451c8a3bc5834e3a4b6e33f573750c4cda227d3db636a2d556d911f2b981330',9),(192,'payment.released','payment',5,NULL,'{\"ewt\": 24138.39, \"gross\": 2703500, \"status\": \"released\", \"remarks\": \"Gross ₱2,703,500 less ₱144,830.35 in deductions — net ₱2,558,669.65 released by cheque LBP-480000.\", \"retention\": 0, \"netReleased\": 2558669.65, \"vatWithheld\": 120691.96}','success','DV-2026-0001 released to Medline Diagnostics Trading Corporation','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-07-09 06:50:00',192,'8451c8a3bc5834e3a4b6e33f573750c4cda227d3db636a2d556d911f2b981330','4c33f34b78793813328d31308d9bd38dc01e782f6538802b28b862a8efd7fc69',10),(193,'app.transition','appEntry',14,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Engineering Office.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-09 01:15:00',193,'4c33f34b78793813328d31308d9bd38dc01e782f6538802b28b862a8efd7fc69','57d8ee98bb0254bf46e110fa6c91667f62de8a3362ac2df113aff0e6d72130f0',7),(194,'app.transition','appEntry',14,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-16 02:40:00',194,'57d8ee98bb0254bf46e110fa6c91667f62de8a3362ac2df113aff0e6d72130f0','5112259a04adfc87b293ae57f826aa7fe7c2eb6229d84c703cd4f43dcd389d6a',5),(195,'app.transition','appEntry',14,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Local Roads and Public Infrastructure Outlay. Certified in the amount of ₱8,400,000.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-23 06:05:00',195,'5112259a04adfc87b293ae57f826aa7fe7c2eb6229d84c703cd4f43dcd389d6a','d6c2bc45dfc13bc96278b043dc279404587aaf8d6b019c611fcf4fc06e0938c2',8),(196,'app.transition','appEntry',14,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-30 03:20:00',196,'d6c2bc45dfc13bc96278b043dc279404587aaf8d6b019c611fcf4fc06e0938c2','024d043b430286795110d9899d7882d957e6bbfcc2f9f4746ef6f9c308db0fef',2),(197,'pr.transition','pr',10,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0002: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-06 00:50:00',197,'024d043b430286795110d9899d7882d957e6bbfcc2f9f4746ef6f9c308db0fef','12074df490b3000e1b18ccc1b6b4009eab19e2f5cf923676304dfbf9db5a6124',7),(198,'pr.transition','pr',10,'{\"status\": \"pendingDepartmentHeadEndorsement\"}','{\"status\": \"pendingCashCertification\", \"remarks\": \"Endorsed by the Head of Office.\"}','success','PR-2026-0002: endorse','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-09 01:40:00',198,'12074df490b3000e1b18ccc1b6b4009eab19e2f5cf923676304dfbf9db5a6124','570641b3609220b718b7716f57da7e507d1add8fa43a667a2a6838821bec653d',3),(199,'pr.transition','pr',10,'{\"status\": \"pendingCashCertification\"}','{\"status\": \"pendingMayorApproval\", \"remarks\": \"Funds available in the General Fund. ₱8,400,000 certified.\"}','success','PR-2026-0002: certifyCash','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-02-12 05:30:00',199,'570641b3609220b718b7716f57da7e507d1add8fa43a667a2a6838821bec653d','a4e9bab8271b226861247069bde3774dcf2874fdfc89f736bad2e8bbf024bcd2',10),(200,'pr.transition','pr',10,'{\"status\": \"pendingMayorApproval\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Approved. Forwarded to the Budget Office for certification of appropriation.\"}','success','PR-2026-0002: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-16 02:05:00',200,'a4e9bab8271b226861247069bde3774dcf2874fdfc89f736bad2e8bbf024bcd2','e8e5d32f460391e232e7536d3f3848e273ec6ef8e95a18b4fc4b08d0066dd19b',2),(201,'pr.transition','pr',10,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingAccountantObligation\", \"remarks\": \"Appropriation certified against Ord. No. 2026-01. Referred to the Accountant for obligation.\"}','success','PR-2026-0002: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-18 07:10:00',201,'e8e5d32f460391e232e7536d3f3848e273ec6ef8e95a18b4fc4b08d0066dd19b','199d4f560b0bc8976cb55579b2a3a5e000eb4f241182dd3824a146ecd9c0b7fa',8),(202,'pr.transition','pr',10,'{\"status\": \"pendingAccountantObligation\"}','{\"status\": \"pendingModeDetermination\", \"remarks\": \"ORS-2026-0002 issued against Ord. No. 2026-01. ₱8,400,000 obligated.\"}','success','PR-2026-0002: obligate','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-02-18 07:10:00',202,'199d4f560b0bc8976cb55579b2a3a5e000eb4f241182dd3824a146ecd9c0b7fa','9f682ad81513087e7d5e49f31bed6eca59286286f2397838e92dab3e60ba916c',9),(203,'pr.mode.determined','pr',10,'{\"status\": \"pendingModeDetermination\"}','{\"mode\": \"competitiveBidding\", \"status\": \"approved\", \"citation\": \"IRR Sec. 26\", \"suggestedMode\": \"competitiveBidding\", \"departedFromSuggestion\": false}','success','PR-2026-0002: mode determined — Competitive Bidding (IRR Sec. 26)','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-22 03:25:00',203,'9f682ad81513087e7d5e49f31bed6eca59286286f2397838e92dab3e60ba916c','f76786691ec2033398465487fa598fc739585939b118dbaa16a78961664cf48d',3),(204,'rfq.published','rfq',10,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱8,400,000.\"}','success','ITB-2026-002 advertised — Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-04 00:00:00',204,'f76786691ec2033398465487fa598fc739585939b118dbaa16a78961664cf48d','5ccf4e4c85a15062aafc9e55c0bdc2a2dc8bebce695421f14f621ce74ac1a784',5),(205,'bids.opened','rfq',10,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-002','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-25 06:30:00',205,'5ccf4e4c85a15062aafc9e55c0bdc2a2dc8bebce695421f14f621ce74ac1a784','4ac08e050e7781a75d9eae57dbe165b265322df9e0c463ec1134385497156d7c',3),(206,'evaluation.submitted','bid',28,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-002','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-03 07:45:00',206,'4ac08e050e7781a75d9eae57dbe165b265322df9e0c463ec1134385497156d7c','695d7189c7b9f01f7d73d2fd93f2632e3abca8350ac03258f23e3c5ace76e6e4',4),(207,'evaluation.closed','rfq',10,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-002','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-03 07:45:00',207,'695d7189c7b9f01f7d73d2fd93f2632e3abca8350ac03258f23e3c5ace76e6e4','4e0f6b694ecefa2c3fcf44629d7b628d002d4e2807ac08d837b601102456f8ad',3),(208,'award.recommended','award',8,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱8,127,000, ₱273,000 below the approved budget.\"}','success','BAC-RES-2026-0002 — award recommended to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-10 03:00:00',208,'4e0f6b694ecefa2c3fcf44629d7b628d002d4e2807ac08d837b601102456f8ad','fa0c9c353d377591cb061a420b05ae46433cc4d6d3335dea8fba6b5e67e0494d',3),(209,'award.approved','award',8,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱8,127,000.\"}','success','NOA-2026-0002 issued to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-17 01:30:00',209,'fa0c9c353d377591cb061a420b05ae46433cc4d6d3335dea8fba6b5e67e0494d','16836349ad697b5dc793b5eb1e285498ee71d538c0b5d4493898b71c5a1c4770',2),(210,'contract.signed','contract',8,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱8,127,000. Delivery due 2026-07-01.\"}','success','CON-2026-0002 signed with Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-29 06:20:00',210,'16836349ad697b5dc793b5eb1e285498ee71d538c0b5d4493898b71c5a1c4770','cbbd3b35877a272fdb8b336b98989068e217da5994faf96ab3591d719c113ebe',2),(211,'contract.ntp.issued','contract',8,NULL,'{\"contractDays\": 120, \"noticeToProceedAt\": \"2026-05-03T01:00:00.000Z\"}','success','Notice to Proceed issued on CON-2026-0002 — 120 calendar days','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-05-03 01:00:00',211,'cbbd3b35877a272fdb8b336b98989068e217da5994faf96ab3591d719c113ebe','fc6c953af21e81f1fb74120112cab0e33267e339585474cd2d2046f496f888e7',2),(212,'delivery.inspected','contract',8,NULL,'{\"status\": \"accepted\", \"remarks\": \"Inspected by the General Services Office and accepted in full. No deductions applied.\"}','success','Delivery inspected and accepted under CON-2026-0002','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-06-17 05:40:00',212,'fc6c953af21e81f1fb74120112cab0e33267e339585474cd2d2046f496f888e7','2751ba3ef5c8a72e1cb8ae13f572e9ebe5b794af87ac37f0443f2a4675fe1fca',5),(213,'invoice.certified','invoice',6,NULL,'{\"status\": \"certified\", \"remarks\": \"Supporting documents complete. Certified for disbursement.\"}','success','INV-2026-0002 certified for payment','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-07-02 03:25:00',213,'2751ba3ef5c8a72e1cb8ae13f572e9ebe5b794af87ac37f0443f2a4675fe1fca','baf5547a886024df6f7a02e5f61cd0c6ebeb10d5c9982c8e3e9ffa0d786cc4b2',9),(214,'payment.released','payment',6,NULL,'{\"ewt\": 145125, \"gross\": 8127000, \"status\": \"released\", \"remarks\": \"Gross ₱8,127,000 less ₱1,320,637.5 in deductions — net ₱6,806,362.5 released by cheque LBP-480001.\", \"retention\": 812700, \"netReleased\": 6806362.5, \"vatWithheld\": 362812.5}','success','DV-2026-0002 released to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-07-10 06:50:00',214,'baf5547a886024df6f7a02e5f61cd0c6ebeb10d5c9982c8e3e9ffa0d786cc4b2','86670412fee19b4866952d4d6dcc62c68ac17fba777e304f0cf995239ac26c37',10),(215,'app.transition','appEntry',15,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Health Office.\"}','success','Construction of Barangay Malitbog Health Station: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-10 01:15:00',215,'86670412fee19b4866952d4d6dcc62c68ac17fba777e304f0cf995239ac26c37','52a840f64224c06dfd9727a845a6f869e83943fc003f92acee84bc2ee8a33a17',7),(216,'app.transition','appEntry',15,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Construction of Barangay Malitbog Health Station: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-17 02:40:00',216,'52a840f64224c06dfd9727a845a6f869e83943fc003f92acee84bc2ee8a33a17','e491481164f05b3798e558bea7c09214a793c1c937b0b48a0eca7f8b1dc1871e',5),(217,'app.transition','appEntry',15,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Health Facilities and Medical Equipment Outlay. Certified in the amount of ₱4,200,000.\"}','success','Construction of Barangay Malitbog Health Station: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-24 06:05:00',217,'e491481164f05b3798e558bea7c09214a793c1c937b0b48a0eca7f8b1dc1871e','62d1e35e038793c7532015d579cb841ffc0b0b021ac9c614573f61b945c0e22c',8),(218,'app.transition','appEntry',15,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Construction of Barangay Malitbog Health Station: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-31 03:20:00',218,'62d1e35e038793c7532015d579cb841ffc0b0b021ac9c614573f61b945c0e22c','fed681a2dc9e1e8f8e0cebe22b22223063a92bcf31b5d2e7608b05d4c5737dec',2),(219,'pr.transition','pr',11,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0003: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-07 00:50:00',219,'fed681a2dc9e1e8f8e0cebe22b22223063a92bcf31b5d2e7608b05d4c5737dec','883de463e6d5ec527137a105267ed59f8b92a8f868ab4dd84b2ef2b7a2534e61',7),(220,'pr.transition','pr',11,'{\"status\": \"pendingDepartmentHeadEndorsement\"}','{\"status\": \"pendingCashCertification\", \"remarks\": \"Endorsed by the Head of Office.\"}','success','PR-2026-0003: endorse','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-10 01:40:00',220,'883de463e6d5ec527137a105267ed59f8b92a8f868ab4dd84b2ef2b7a2534e61','73e5aba703ac9c1608b714045d49e45d0e86df69f2d3cf14dec174903012eece',3),(221,'pr.transition','pr',11,'{\"status\": \"pendingCashCertification\"}','{\"status\": \"pendingMayorApproval\", \"remarks\": \"Funds available in the General Fund. ₱4,200,000 certified.\"}','success','PR-2026-0003: certifyCash','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-02-13 05:30:00',221,'73e5aba703ac9c1608b714045d49e45d0e86df69f2d3cf14dec174903012eece','d84ed5bf795f957d98fbc4f701a9e2d708b3c5e9b14959e7adbf5f5d172f70de',10),(222,'pr.transition','pr',11,'{\"status\": \"pendingMayorApproval\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Approved. Forwarded to the Budget Office for certification of appropriation.\"}','success','PR-2026-0003: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-17 02:05:00',222,'d84ed5bf795f957d98fbc4f701a9e2d708b3c5e9b14959e7adbf5f5d172f70de','d2c03899943423d544aede2df755752a3c21bb036c7a68a3f36a32d40d616a2c',2),(223,'pr.transition','pr',11,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingAccountantObligation\", \"remarks\": \"Appropriation certified against Ord. No. 2026-01. Referred to the Accountant for obligation.\"}','success','PR-2026-0003: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-19 07:10:00',223,'d2c03899943423d544aede2df755752a3c21bb036c7a68a3f36a32d40d616a2c','96bfdd6b1e481241e108224824a6cfd8f14437169ac1c51d1ee8c2cec7b22e0a',8),(224,'pr.transition','pr',11,'{\"status\": \"pendingAccountantObligation\"}','{\"status\": \"pendingModeDetermination\", \"remarks\": \"ORS-2026-0003 issued against Ord. No. 2026-01. ₱4,200,000 obligated.\"}','success','PR-2026-0003: obligate','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-02-19 07:10:00',224,'96bfdd6b1e481241e108224824a6cfd8f14437169ac1c51d1ee8c2cec7b22e0a','1e0e8e42dae49fa14a4195b3a77e4b5e6f95d9230426180dac7682b4b3bafbf2',9),(225,'pr.mode.determined','pr',11,'{\"status\": \"pendingModeDetermination\"}','{\"mode\": \"competitiveBidding\", \"status\": \"approved\", \"citation\": \"IRR Sec. 26\", \"suggestedMode\": \"competitiveBidding\", \"departedFromSuggestion\": false}','success','PR-2026-0003: mode determined — Competitive Bidding (IRR Sec. 26)','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-23 03:25:00',225,'1e0e8e42dae49fa14a4195b3a77e4b5e6f95d9230426180dac7682b4b3bafbf2','3d22948abcd052a985ffe277664c2282ccafb2782c0cddd3539bfba1cafd23d9',3),(226,'rfq.published','rfq',11,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱4,200,000.\"}','success','ITB-2026-003 advertised — Construction of Barangay Malitbog Health Station','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-05 00:00:00',226,'3d22948abcd052a985ffe277664c2282ccafb2782c0cddd3539bfba1cafd23d9','0f232a5f4b6f2e60d386b5bdd02e30d6e5b0b59b245d603158fa587329481e54',5),(227,'bids.opened','rfq',11,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-003','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-26 06:30:00',227,'0f232a5f4b6f2e60d386b5bdd02e30d6e5b0b59b245d603158fa587329481e54','2c0ceff662f4af96974866b54888c871985ca52def9bbc6943498eae90f3cd50',3),(228,'evaluation.submitted','bid',31,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-003','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-04 07:45:00',228,'2c0ceff662f4af96974866b54888c871985ca52def9bbc6943498eae90f3cd50','2e09179eaf359bd158ef09509233e2c607d5b86e8fd57fed06d870f86f1f2cf3',4),(229,'evaluation.closed','rfq',11,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-003','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-04 07:45:00',229,'2e09179eaf359bd158ef09509233e2c607d5b86e8fd57fed06d870f86f1f2cf3','1ffd373415f029b75f9500f596a985d0365d97ee3451c3f7df5522513de15fd2',3),(230,'award.recommended','award',9,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱4,085,000, ₱115,000 below the approved budget.\"}','success','BAC-RES-2026-0003 — award recommended to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-11 03:00:00',230,'1ffd373415f029b75f9500f596a985d0365d97ee3451c3f7df5522513de15fd2','6e7024b64eb1d8b83dff77835f2d8bce07da207607fe3033cb198efccb2e5772',3),(231,'award.approved','award',9,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱4,085,000.\"}','success','NOA-2026-0003 issued to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-18 01:30:00',231,'6e7024b64eb1d8b83dff77835f2d8bce07da207607fe3033cb198efccb2e5772','96d35dbdf9eae3e4348cbe6aa6515f9a0176b782b98a1f3137dfc6c690f66e6d',2),(232,'contract.signed','contract',9,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱4,085,000. Delivery due 2026-07-02.\"}','success','CON-2026-0003 signed with Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-30 06:20:00',232,'96d35dbdf9eae3e4348cbe6aa6515f9a0176b782b98a1f3137dfc6c690f66e6d','8bcbbb93208e205bd367f61adc56829bc74201d291a8b7a83c89ee9f51a4f28e',2),(233,'contract.ntp.issued','contract',9,NULL,'{\"contractDays\": 120, \"noticeToProceedAt\": \"2026-05-04T01:00:00.000Z\"}','success','Notice to Proceed issued on CON-2026-0003 — 120 calendar days','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-05-04 01:00:00',233,'8bcbbb93208e205bd367f61adc56829bc74201d291a8b7a83c89ee9f51a4f28e','dac4b82a8d7cf0ffe875afc9a45250f9f12c3ca6867bf52e7e721c94eb491af7',2),(234,'app.transition','appEntry',16,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Information Technology Office.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-11 01:15:00',234,'dac4b82a8d7cf0ffe875afc9a45250f9f12c3ca6867bf52e7e721c94eb491af7','502c509d348e1066cdc0c77dcfd4993d453639d79ad88ba910b7643441109553',7),(235,'app.transition','appEntry',16,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-18 02:40:00',235,'502c509d348e1066cdc0c77dcfd4993d453639d79ad88ba910b7643441109553','d07ad330d13e6dec67ce9861c0eac7009a6d75e8e63037e9e890e7ce599b6fa4',5),(236,'app.transition','appEntry',16,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Information Technology Equipment and Systems. Certified in the amount of ₱1,950,000.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-25 06:05:00',236,'d07ad330d13e6dec67ce9861c0eac7009a6d75e8e63037e9e890e7ce599b6fa4','bc2aed7469fa64b4128d70e46033fdea3508b945d1b9053ccfe3459684d4c848',8),(237,'app.transition','appEntry',16,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-01 03:20:00',237,'bc2aed7469fa64b4128d70e46033fdea3508b945d1b9053ccfe3459684d4c848','7ed32a2ff0aa43982f6aafa940c95d24b398c1d2f3bd8f51c5e04ed46ea603e8',2),(238,'pr.transition','pr',12,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0004: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-08 00:50:00',238,'7ed32a2ff0aa43982f6aafa940c95d24b398c1d2f3bd8f51c5e04ed46ea603e8','b3f514adedbc4a41d9d623b2d529fa24b34e6ac3fa86a16dbdabc10e7f2cf1ff',7),(239,'pr.transition','pr',12,'{\"status\": \"pendingDepartmentHeadEndorsement\"}','{\"status\": \"pendingCashCertification\", \"remarks\": \"Endorsed by the Head of Office.\"}','success','PR-2026-0004: endorse','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-11 01:40:00',239,'b3f514adedbc4a41d9d623b2d529fa24b34e6ac3fa86a16dbdabc10e7f2cf1ff','3fd6c3727fa6944f8855313d635ec5992a328ff4440dd2e82a3fe1a0f37c6cf8',3),(240,'pr.transition','pr',12,'{\"status\": \"pendingCashCertification\"}','{\"status\": \"pendingMayorApproval\", \"remarks\": \"Funds available in the General Fund. ₱1,950,000 certified.\"}','success','PR-2026-0004: certifyCash','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-02-14 05:30:00',240,'3fd6c3727fa6944f8855313d635ec5992a328ff4440dd2e82a3fe1a0f37c6cf8','804595bde80c99d165a61066053ecd7c2b17bbc7ab1ff06eb288c40275a06bc6',10),(241,'pr.transition','pr',12,'{\"status\": \"pendingMayorApproval\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Approved. Forwarded to the Budget Office for certification of appropriation.\"}','success','PR-2026-0004: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-18 02:05:00',241,'804595bde80c99d165a61066053ecd7c2b17bbc7ab1ff06eb288c40275a06bc6','a94317191f035cc554c46fe347d1bcef109c84c45c81e0ae9571cc8fac8d38b1',2),(242,'pr.transition','pr',12,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingAccountantObligation\", \"remarks\": \"Appropriation certified against Ord. No. 2026-01. Referred to the Accountant for obligation.\"}','success','PR-2026-0004: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-20 07:10:00',242,'a94317191f035cc554c46fe347d1bcef109c84c45c81e0ae9571cc8fac8d38b1','468bbea24674a3929deb08342682a7f9a246f0813cc21d8ccf6e5233921a4b0a',8),(243,'pr.transition','pr',12,'{\"status\": \"pendingAccountantObligation\"}','{\"status\": \"pendingModeDetermination\", \"remarks\": \"ORS-2026-0004 issued against Ord. No. 2026-01. ₱1,950,000 obligated.\"}','success','PR-2026-0004: obligate','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-02-20 07:10:00',243,'468bbea24674a3929deb08342682a7f9a246f0813cc21d8ccf6e5233921a4b0a','dbe5831ade707e4d2464639dfcb7abdff4af666f63bb176cb820ee930f5a9a2e',9),(244,'pr.mode.determined','pr',12,'{\"status\": \"pendingModeDetermination\"}','{\"mode\": \"competitiveBidding\", \"status\": \"approved\", \"citation\": \"IRR Sec. 26\", \"suggestedMode\": \"competitiveBidding\", \"departedFromSuggestion\": false}','success','PR-2026-0004: mode determined — Competitive Bidding (IRR Sec. 26)','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-02-24 03:25:00',244,'dbe5831ade707e4d2464639dfcb7abdff4af666f63bb176cb820ee930f5a9a2e','cb30b3b15e1a4b2ac1fa71c075f2043f91eae162bf5a0ae7b5a2c53a7d33e3ef',3),(245,'rfq.published','rfq',12,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱1,950,000.\"}','success','ITB-2026-004 advertised — Supply and Delivery of Information Technology Equipment for Municipal Offices','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-07-28 00:00:00',245,'cb30b3b15e1a4b2ac1fa71c075f2043f91eae162bf5a0ae7b5a2c53a7d33e3ef','b1d3bb0445447f10754f337607f189bdfd26551963cb3b2d9c5f72bab07e3aa5',5),(246,'app.transition','appEntry',17,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the General Services Office (GSO).\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-12 01:15:00',246,'b1d3bb0445447f10754f337607f189bdfd26551963cb3b2d9c5f72bab07e3aa5','4646ee21328e388a0d1011caf3ec1472c349232346faca68cd60eca8a354d245',7),(247,'app.transition','appEntry',17,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-19 02:40:00',247,'4646ee21328e388a0d1011caf3ec1472c349232346faca68cd60eca8a354d245','3e099c2f2c74bd6448d3eb806be7c40a19d8b4c2b07287a75b2fa64097893977',5),(248,'app.transition','appEntry',17,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — General Services Motor Vehicle and Equipment Outlay. Certified in the amount of ₱11,500,000.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-26 06:05:00',248,'3e099c2f2c74bd6448d3eb806be7c40a19d8b4c2b07287a75b2fa64097893977','c0042d645ac85e11dfa8938af2e957a423a6475dfa86154a1b25741bef3ee585',8),(249,'app.transition','appEntry',17,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-02 03:20:00',249,'c0042d645ac85e11dfa8938af2e957a423a6475dfa86154a1b25741bef3ee585','150d2af271e72d34d796315fb7cac40e8603ed6f1d773282b56602c680b188bd',2),(250,'app.transition','appEntry',18,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Engineering Office.\"}','success','Construction of Municipal Evacuation Center: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-13 01:15:00',250,'150d2af271e72d34d796315fb7cac40e8603ed6f1d773282b56602c680b188bd','9784069580966c77b9a84da683e7408ae0f6c2427650100596c13e4d9111fa83',7),(251,'app.transition','appEntry',18,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Construction of Municipal Evacuation Center: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-20 02:40:00',251,'9784069580966c77b9a84da683e7408ae0f6c2427650100596c13e4d9111fa83','8ead4d2643134d35335ba997baeb9f944267eac620dd683bd04cddedd17e5b78',5),(252,'app.transition','appEntry',18,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Local Roads and Public Infrastructure Outlay. Certified in the amount of ₱15,750,000.\"}','success','Construction of Municipal Evacuation Center: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-27 06:05:00',252,'8ead4d2643134d35335ba997baeb9f944267eac620dd683bd04cddedd17e5b78','45871d00e67d73cb52d60b95ed7afef74bb10ca0e32afa8938a88eb0f4e6ea3b',8),(253,'app.transition','appEntry',18,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Construction of Municipal Evacuation Center: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-03 03:20:00',253,'45871d00e67d73cb52d60b95ed7afef74bb10ca0e32afa8938a88eb0f4e6ea3b','b3394edc6ca1a54bef2468e0383f6673d400748af9c50f46ee55e8596cc76b2d',2),(254,'auth.login.success','auth',5,NULL,NULL,'success','Marilou D. Ceniza signed in','::1','Marilou D. Ceniza','bacSecretariat','2026-08-06 01:27:34',254,'b3394edc6ca1a54bef2468e0383f6673d400748af9c50f46ee55e8596cc76b2d','4ba63a7b1408ed0bf66efe34fb47cbcc5ef7c8cfcd6c6df876042b9f1aacc8f5',5),(255,'auth.login.success','auth',12,NULL,NULL,'success','Fr. Antonio L. Perez signed in','::1','Fr. Antonio L. Perez','observer','2026-08-06 01:27:35',255,'4ba63a7b1408ed0bf66efe34fb47cbcc5ef7c8cfcd6c6df876042b9f1aacc8f5','c54073c12be319aeb70fb53b4b8b542a64decce949c5c1cb900a95ea5cbe4304',12),(256,'auth.login.success','auth',5,NULL,NULL,'success','Marilou D. Ceniza signed in','::1','Marilou D. Ceniza','bacSecretariat','2026-08-06 01:27:35',256,'c54073c12be319aeb70fb53b4b8b542a64decce949c5c1cb900a95ea5cbe4304','e2dc2beaaa39bce0b8fe721ca89c7606fa1eb86eb4beb1d16651f48e8c2d7e03',5),(257,'auth.login.success','auth',11,NULL,NULL,'success','Medline Diagnostics Trading Corporation signed in','::1','Medline Diagnostics Trading Corporation','vendor','2026-08-06 01:27:36',257,'e2dc2beaaa39bce0b8fe721ca89c7606fa1eb86eb4beb1d16651f48e8c2d7e03','6a9c269336e49e82adf9e49936aca8b073edbb262853ca0d632fdf4316cfef25',11),(258,'auth.login.success','auth',15,NULL,NULL,'success','Municipal Planning and Development Coordinator signed in','::1','Municipal Planning and Development Coordinator','planningOfficer','2026-08-06 01:27:37',258,'6a9c269336e49e82adf9e49936aca8b073edbb262853ca0d632fdf4316cfef25','2e37c81c9181bdd72ffe38f54a556476a936b5e343d09a8c3e97913cbe3500ca',15),(259,'auth.login.success','auth',8,NULL,NULL,'success','Elena S. Villaflor signed in','::1','Elena S. Villaflor','budgetOfficer','2026-08-06 01:27:37',259,'2e37c81c9181bdd72ffe38f54a556476a936b5e343d09a8c3e97913cbe3500ca','4a4167e9981e3c1d59d3355cc21723519e40e70d4b116ad325ef547eabf94dc8',8),(260,'auth.login.success','auth',8,NULL,NULL,'success','Elena S. Villaflor signed in','::1','Elena S. Villaflor','budgetOfficer','2026-08-06 01:27:38',260,'4a4167e9981e3c1d59d3355cc21723519e40e70d4b116ad325ef547eabf94dc8','0f258c0dba1f9aaf0e5364caded56c4976b488a235f540fae315acd3714b90f8',8),(261,'auth.login.success','auth',7,NULL,NULL,'success','Dr. Anna Liza R. Cortez signed in','::1','Dr. Anna Liza R. Cortez','departmentRequester','2026-08-06 01:27:39',261,'0f258c0dba1f9aaf0e5364caded56c4976b488a235f540fae315acd3714b90f8','2a1d37f29ca9173f84c7c43b259e132531f2cddb2533703ef3a771c1d46379ce',7),(262,'auth.login.success','auth',9,NULL,NULL,'success','Ramon T. Delos Reyes signed in','::1','Ramon T. Delos Reyes','municipalAccountant','2026-08-06 01:27:39',262,'2a1d37f29ca9173f84c7c43b259e132531f2cddb2533703ef3a771c1d46379ce','763434cef0828793e293df66518de8a42eaec350a8d69c8f05b9b92d498c4816',9),(263,'auth.login.success','auth',13,NULL,NULL,'success','Grace B. Mendoza signed in','::1','Grace B. Mendoza','internalAuditor','2026-08-06 01:27:40',263,'763434cef0828793e293df66518de8a42eaec350a8d69c8f05b9b92d498c4816','1a156d8b632dd7f83966e5ef5eefbdf5dcab33d57d0e01e87df2a20f98476c28',13),(264,'auth.login.success','auth',11,NULL,NULL,'success','Medline Diagnostics Trading Corporation signed in','::1','Medline Diagnostics Trading Corporation','vendor','2026-08-06 01:27:41',264,'1a156d8b632dd7f83966e5ef5eefbdf5dcab33d57d0e01e87df2a20f98476c28','3d12fc70366d1e37b0d190693115bd3dcc9ad1855989feac16ead90d1210e018',11);
/*!40000 ALTER TABLE `auditlogs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `awards`
--

DROP TABLE IF EXISTS `awards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `awards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `noaNumber` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `noaDate` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `status` enum('pendingHopeApproval','issued','accepted','declined','cancelled','disapproved') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendingHopeApproval',
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `rfqId` int DEFAULT NULL,
  `bidId` int DEFAULT NULL,
  `vendorId` int DEFAULT NULL,
  `recommendedById` int DEFAULT NULL,
  `approvedById` int DEFAULT NULL,
  `awardBasis` enum('LCRB','HRRB') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `disapprovalGrounds` text COLLATE utf8mb4_unicode_ci,
  `disapprovedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `noaNumber` (`noaNumber`),
  UNIQUE KEY `noaNumber_2` (`noaNumber`),
  KEY `rfqId` (`rfqId`),
  KEY `bidId` (`bidId`),
  KEY `vendorId` (`vendorId`),
  KEY `recommendedById` (`recommendedById`),
  KEY `approvedById` (`approvedById`),
  CONSTRAINT `awards_ibfk_1` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_10` FOREIGN KEY (`approvedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_2` FOREIGN KEY (`bidId`) REFERENCES `bids` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_3` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_4` FOREIGN KEY (`recommendedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_5` FOREIGN KEY (`approvedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_6` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_7` FOREIGN KEY (`bidId`) REFERENCES `bids` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_8` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_9` FOREIGN KEY (`recommendedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `awards`
--

LOCK TABLES `awards` WRITE;
/*!40000 ALTER TABLE `awards` DISABLE KEYS */;
INSERT INTO `awards` VALUES (7,'NOA-2026-0001','2026-04-16',2703500.00,'accepted',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,25,7,3,2,NULL,NULL,NULL),(8,'NOA-2026-0002','2026-04-17',8127000.00,'accepted',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',10,28,8,3,2,NULL,NULL,NULL),(9,'NOA-2026-0003','2026-04-18',4085000.00,'accepted',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,31,8,3,2,NULL,NULL,NULL);
/*!40000 ALTER TABLE `awards` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bacresolutions`
--

DROP TABLE IF EXISTS `bacresolutions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bacresolutions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `resolutionNo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('recommendAward','failureOfBidding','adoptAlternativeMode','declareFailedProject','postDisqualification') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `recitals` text COLLATE utf8mb4_unicode_ci,
  `resolvedAt` datetime NOT NULL,
  `members` json DEFAULT NULL,
  `quorumMet` tinyint(1) NOT NULL DEFAULT '1',
  `entityRef` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityId` int NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `chairpersonId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `resolutionNo` (`resolutionNo`),
  UNIQUE KEY `resolutionNo_2` (`resolutionNo`),
  KEY `bac_resolutions_entity_ref_entity_id` (`entityRef`,`entityId`),
  KEY `bac_resolutions_type` (`type`),
  KEY `chairpersonId` (`chairpersonId`),
  CONSTRAINT `bacresolutions_ibfk_1` FOREIGN KEY (`chairpersonId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `bacresolutions_ibfk_2` FOREIGN KEY (`chairpersonId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bacresolutions`
--

LOCK TABLES `bacresolutions` WRITE;
/*!40000 ALTER TABLE `bacresolutions` DISABLE KEYS */;
INSERT INTO `bacresolutions` VALUES (7,'BAC-RES-2026-0001','recommendAward','Resolution recommending award of ITB-2026-001 to Medline Diagnostics Trading Corporation','Three (3) bids were received and opened in public session. The bid of Medline Diagnostics Trading Corporation at ₱2,703,500 was determined to be the Lowest Calculated Responsive Bid and passed post-qualification under IRR Sec. 60.','2026-04-09 03:00:00','[{\"name\": \"Atty. Rodel V. Manalo\", \"role\": \"bacChairperson\", \"userId\": 3, \"concurred\": true}, {\"name\": \"Engr. Cristina P. Bautista\", \"role\": \"bacMember\", \"userId\": 4, \"concurred\": true}, {\"name\": \"Engr. Noel A. Villamor\", \"role\": \"twgMember\", \"userId\": 6, \"concurred\": true}]',1,'award',7,'2026-08-06 01:27:01','2026-08-06 01:27:01',3),(8,'BAC-RES-2026-0002','recommendAward','Resolution recommending award of ITB-2026-002 to Sierra Verde Construction and Supply, Inc.','Three (3) bids were received and opened in public session. The bid of Sierra Verde Construction and Supply, Inc. at ₱8,127,000 was determined to be the Lowest Calculated Responsive Bid and passed post-qualification under IRR Sec. 60.','2026-04-10 03:00:00','[{\"name\": \"Atty. Rodel V. Manalo\", \"role\": \"bacChairperson\", \"userId\": 3, \"concurred\": true}, {\"name\": \"Engr. Cristina P. Bautista\", \"role\": \"bacMember\", \"userId\": 4, \"concurred\": true}, {\"name\": \"Engr. Noel A. Villamor\", \"role\": \"twgMember\", \"userId\": 6, \"concurred\": true}]',1,'award',8,'2026-08-06 01:27:02','2026-08-06 01:27:02',3),(9,'BAC-RES-2026-0003','recommendAward','Resolution recommending award of ITB-2026-003 to Sierra Verde Construction and Supply, Inc.','Three (3) bids were received and opened in public session. The bid of Sierra Verde Construction and Supply, Inc. at ₱4,085,000 was determined to be the Lowest Calculated Responsive Bid and passed post-qualification under IRR Sec. 60.','2026-04-11 03:00:00','[{\"name\": \"Atty. Rodel V. Manalo\", \"role\": \"bacChairperson\", \"userId\": 3, \"concurred\": true}, {\"name\": \"Engr. Cristina P. Bautista\", \"role\": \"bacMember\", \"userId\": 4, \"concurred\": true}, {\"name\": \"Engr. Noel A. Villamor\", \"role\": \"twgMember\", \"userId\": 6, \"concurred\": true}]',1,'award',9,'2026-08-06 01:27:02','2026-08-06 01:27:02',3);
/*!40000 ALTER TABLE `bacresolutions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bidopeningrecords`
--

DROP TABLE IF EXISTS `bidopeningrecords`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bidopeningrecords` (
  `id` int NOT NULL AUTO_INCREMENT,
  `openedAt` datetime NOT NULL,
  `witnesses` text COLLATE utf8mb4_unicode_ci,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `bidsReceived` int NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `rfqId` int DEFAULT NULL,
  `openedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `rfqId` (`rfqId`),
  KEY `openedById` (`openedById`),
  CONSTRAINT `bidopeningrecords_ibfk_1` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `bidopeningrecords_ibfk_2` FOREIGN KEY (`openedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `bidopeningrecords_ibfk_3` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `bidopeningrecords_ibfk_4` FOREIGN KEY (`openedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bidopeningrecords`
--

LOCK TABLES `bidopeningrecords` WRITE;
/*!40000 ALTER TABLE `bidopeningrecords` DISABLE KEYS */;
INSERT INTO `bidopeningrecords` VALUES (7,'2026-03-24 06:30:00','COA representative, two (2) observers from accredited civil society organisations','All envelopes received intact and opened in public session.',3,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,3),(8,'2026-03-25 06:30:00','COA representative, two (2) observers from accredited civil society organisations','All envelopes received intact and opened in public session.',3,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,3),(9,'2026-03-26 06:30:00','COA representative, two (2) observers from accredited civil society organisations','All envelopes received intact and opened in public session.',3,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,3);
/*!40000 ALTER TABLE `bidopeningrecords` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bids`
--

DROP TABLE IF EXISTS `bids`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `technicalSubmitted` tinyint(1) NOT NULL DEFAULT '0',
  `financialSealed` tinyint(1) NOT NULL DEFAULT '1',
  `totalBidPrice` decimal(15,2) DEFAULT NULL,
  `submittedAt` datetime DEFAULT NULL,
  `blindLabel` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('submitted','opened','technicalPassed','technicalFailed','financialOpened','postQualified','postDisqualified','awarded','lost','withdrawn') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted',
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `rfqId` int DEFAULT NULL,
  `vendorId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `rfqId` (`rfqId`),
  KEY `vendorId` (`vendorId`),
  CONSTRAINT `bids_ibfk_1` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `bids_ibfk_2` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `bids_ibfk_3` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `bids_ibfk_4` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bids`
--

LOCK TABLES `bids` WRITE;
/*!40000 ALTER TABLE `bids` DISABLE KEYS */;
INSERT INTO `bids` VALUES (25,1,0,2703500.00,'2026-03-23 08:30:00','Bidder A','postQualified',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,7),(26,1,0,2752163.00,'2026-03-23 08:30:00','Bidder B','lost',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,8),(27,1,0,2800826.00,'2026-03-23 08:30:00','Bidder C','lost',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,9),(28,1,0,8127000.00,'2026-03-24 08:30:00','Bidder A','postQualified',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,8),(29,1,0,8273286.00,'2026-03-24 08:30:00','Bidder B','lost',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,7),(30,1,0,8419572.00,'2026-03-24 08:30:00','Bidder C','lost',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,9),(31,1,0,4085000.00,'2026-03-25 08:30:00','Bidder A','postQualified',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,8),(32,1,0,4158530.00,'2026-03-25 08:30:00','Bidder B','lost',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,7),(33,1,0,4232060.00,'2026-03-25 08:30:00','Bidder C','lost',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,9),(34,1,1,NULL,'2026-08-03 07:00:00',NULL,'submitted',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',12,9),(35,1,1,NULL,'2026-08-03 07:00:00',NULL,'submitted',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',12,7),(36,1,1,NULL,'2026-08-03 07:00:00',NULL,'submitted',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',12,8);
/*!40000 ALTER TABLE `bids` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `budgetproceedings`
--

DROP TABLE IF EXISTS `budgetproceedings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `budgetproceedings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` enum('forum','hearing','deliberation') COLLATE utf8mb4_unicode_ci NOT NULL,
  `scheduledAt` datetime NOT NULL,
  `heldAt` datetime DEFAULT NULL,
  `venue` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `agenda` text COLLATE utf8mb4_unicode_ci,
  `minutes` text COLLATE utf8mb4_unicode_ci,
  `attendees` json DEFAULT NULL,
  `departmentId` int DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `executiveBudgetId` int DEFAULT NULL,
  `recordedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `departmentId` (`departmentId`),
  KEY `executiveBudgetId` (`executiveBudgetId`),
  KEY `recordedById` (`recordedById`),
  KEY `budget_proceedings_type` (`type`),
  CONSTRAINT `budgetproceedings_ibfk_1` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `budgetproceedings_ibfk_2` FOREIGN KEY (`executiveBudgetId`) REFERENCES `executivebudgets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `budgetproceedings_ibfk_3` FOREIGN KEY (`recordedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `budgetproceedings`
--

LOCK TABLES `budgetproceedings` WRITE;
/*!40000 ALTER TABLE `budgetproceedings` DISABLE KEYS */;
/*!40000 ALTER TABLE `budgetproceedings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `budgetproposallines`
--

DROP TABLE IF EXISTS `budgetproposallines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `budgetproposallines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `isDevelopmentFund` tinyint(1) NOT NULL DEFAULT '0',
  `isLdrrmf` tinyint(1) NOT NULL DEFAULT '0',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expenseClass` enum('personalServices','mooe','capitalOutlay') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mooe',
  `fund` enum('generalFund','specialEducationFund','trustFund') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'generalFund',
  `papCode` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uacsCode` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `proposedAmount` decimal(15,2) NOT NULL,
  `recommendedAmount` decimal(15,2) DEFAULT NULL,
  `finalAmount` decimal(15,2) DEFAULT NULL,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `budgetProposalId` int DEFAULT NULL,
  `aipEntryId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `budgetProposalId` (`budgetProposalId`),
  KEY `aipEntryId` (`aipEntryId`),
  CONSTRAINT `budgetproposallines_ibfk_1` FOREIGN KEY (`budgetProposalId`) REFERENCES `budgetproposals` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `budgetproposallines_ibfk_2` FOREIGN KEY (`aipEntryId`) REFERENCES `aipentries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `budgetproposallines`
--

LOCK TABLES `budgetproposallines` WRITE;
/*!40000 ALTER TABLE `budgetproposallines` DISABLE KEYS */;
/*!40000 ALTER TABLE `budgetproposallines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `budgetproposals`
--

DROP TABLE IF EXISTS `budgetproposals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `budgetproposals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fiscalYear` int NOT NULL,
  `status` enum('draft','submitted','mbcReviewed','consolidated','heard','finalised','returned') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `proposedTotal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `recommendedTotal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `finalTotal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `previousYearAppropriation` decimal(15,2) DEFAULT NULL,
  `justification` text COLLATE utf8mb4_unicode_ci,
  `submittedAt` datetime DEFAULT NULL,
  `returnRemarks` text COLLATE utf8mb4_unicode_ci,
  `reviewNotes` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `executiveBudgetId` int DEFAULT NULL,
  `departmentId` int DEFAULT NULL,
  `preparedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `executiveBudgetId` (`executiveBudgetId`),
  KEY `departmentId` (`departmentId`),
  KEY `preparedById` (`preparedById`),
  KEY `budget_proposals_fiscal_year_status` (`fiscalYear`,`status`),
  CONSTRAINT `budgetproposals_ibfk_1` FOREIGN KEY (`executiveBudgetId`) REFERENCES `executivebudgets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `budgetproposals_ibfk_2` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `budgetproposals_ibfk_3` FOREIGN KEY (`preparedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `budgetproposals`
--

LOCK TABLES `budgetproposals` WRITE;
/*!40000 ALTER TABLE `budgetproposals` DISABLE KEYS */;
/*!40000 ALTER TABLE `budgetproposals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conferenceattendances`
--

DROP TABLE IF EXISTS `conferenceattendances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conferenceattendances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `joinedAt` datetime NOT NULL,
  `attendeeName` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organization` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `sessionId` int DEFAULT NULL,
  `userId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sessionId` (`sessionId`),
  KEY `userId` (`userId`),
  CONSTRAINT `conferenceattendances_ibfk_1` FOREIGN KEY (`sessionId`) REFERENCES `liveconferencesessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `conferenceattendances_ibfk_2` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `conferenceattendances_ibfk_3` FOREIGN KEY (`sessionId`) REFERENCES `liveconferencesessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `conferenceattendances_ibfk_4` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conferenceattendances`
--

LOCK TABLES `conferenceattendances` WRITE;
/*!40000 ALTER TABLE `conferenceattendances` DISABLE KEYS */;
/*!40000 ALTER TABLE `conferenceattendances` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contracts`
--

DROP TABLE IF EXISTS `contracts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contracts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contractNo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `poRef` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `amountPaid` decimal(15,2) NOT NULL DEFAULT '0.00',
  `instrumentType` enum('purchaseOrder','contract') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'purchaseOrder',
  `category` enum('goods','infrastructure','consulting') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'goods',
  `startDate` date DEFAULT NULL,
  `deliveryDeadline` date DEFAULT NULL,
  `noticeToProceedAt` datetime DEFAULT NULL,
  `contractDays` int DEFAULT NULL,
  `timeExtensionDays` int NOT NULL DEFAULT '0',
  `timeExtensionReason` text COLLATE utf8mb4_unicode_ci,
  `actualCompletionAt` datetime DEFAULT NULL,
  `terms` text COLLATE utf8mb4_unicode_ci,
  `status` enum('draft','pendingSignatures','active','completed','cancelled','rescinded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `signedByLguAt` datetime DEFAULT NULL,
  `signedByVendorAt` datetime DEFAULT NULL,
  `retentionHeld` decimal(15,2) NOT NULL DEFAULT '0.00',
  `retentionReleasedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `awardId` int DEFAULT NULL,
  `vendorId` int DEFAULT NULL,
  `draftedById` int DEFAULT NULL,
  `variationTotal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `terminatedAt` datetime DEFAULT NULL,
  `terminationGround` enum('default','breach','convenience','unlawfulActs') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `terminationReason` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contractNo` (`contractNo`),
  UNIQUE KEY `contractNo_2` (`contractNo`),
  KEY `awardId` (`awardId`),
  KEY `vendorId` (`vendorId`),
  KEY `draftedById` (`draftedById`),
  CONSTRAINT `contracts_ibfk_1` FOREIGN KEY (`awardId`) REFERENCES `awards` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `contracts_ibfk_2` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `contracts_ibfk_3` FOREIGN KEY (`draftedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `contracts_ibfk_4` FOREIGN KEY (`awardId`) REFERENCES `awards` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `contracts_ibfk_5` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `contracts_ibfk_6` FOREIGN KEY (`draftedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contracts`
--

LOCK TABLES `contracts` WRITE;
/*!40000 ALTER TABLE `contracts` DISABLE KEYS */;
INSERT INTO `contracts` VALUES (7,'CON-2026-0001',NULL,2703500.00,2703500.00,'purchaseOrder','goods','2026-05-02','2026-06-30','2026-05-02 01:00:00',60,0,NULL,'2026-06-16 05:40:00','Payment upon delivery, inspection and acceptance, subject to the usual government deductions.','completed','2026-04-28 06:20:00','2026-04-28 06:20:00',0.00,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',7,7,5,0.00,NULL,NULL,NULL),(8,'CON-2026-0002',NULL,8127000.00,8127000.00,'contract','infrastructure','2026-05-03','2026-07-01','2026-05-03 01:00:00',120,0,NULL,'2026-06-17 05:40:00','Payment upon delivery, inspection and acceptance, subject to the usual government deductions.','completed','2026-04-29 06:20:00','2026-04-29 06:20:00',812700.00,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',8,8,5,0.00,NULL,NULL,NULL),(9,'CON-2026-0003',NULL,4085000.00,0.00,'contract','infrastructure','2026-05-04','2026-07-02','2026-05-04 01:00:00',120,0,NULL,NULL,'Payment upon delivery, inspection and acceptance, subject to the usual government deductions.','active','2026-04-30 06:20:00','2026-04-30 06:20:00',0.00,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',9,8,5,0.00,NULL,NULL,NULL);
/*!40000 ALTER TABLE `contracts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `deliveries`
--

DROP TABLE IF EXISTS `deliveries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `deliveries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `deliveredAt` datetime DEFAULT NULL,
  `inspectedAt` datetime DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` enum('reported','underInspection','accepted','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reported',
  `acceptedQuantityNote` text COLLATE utf8mb4_unicode_ci,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `contractId` int DEFAULT NULL,
  `reportedById` int DEFAULT NULL,
  `inspectedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `contractId` (`contractId`),
  KEY `reportedById` (`reportedById`),
  KEY `inspectedById` (`inspectedById`),
  CONSTRAINT `deliveries_ibfk_1` FOREIGN KEY (`contractId`) REFERENCES `contracts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `deliveries_ibfk_2` FOREIGN KEY (`reportedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `deliveries_ibfk_3` FOREIGN KEY (`inspectedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `deliveries_ibfk_4` FOREIGN KEY (`contractId`) REFERENCES `contracts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `deliveries_ibfk_5` FOREIGN KEY (`reportedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `deliveries_ibfk_6` FOREIGN KEY (`inspectedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `deliveries`
--

LOCK TABLES `deliveries` WRITE;
/*!40000 ALTER TABLE `deliveries` DISABLE KEYS */;
INSERT INTO `deliveries` VALUES (7,'2026-06-12 02:15:00','2026-06-16 05:40:00','Full delivery received and inspected.','accepted','Delivered in full, conforming to specification.',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',7,7,5),(8,'2026-06-13 02:15:00','2026-06-17 05:40:00','Full delivery received and inspected.','accepted','Delivered in full, conforming to specification.',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',8,7,5),(9,'2026-06-14 02:15:00',NULL,'Partial delivery received; inspection pending.','underInspection',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',9,7,NULL);
/*!40000 ALTER TABLE `deliveries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `departments`
--

DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('endUser','committee','support','executive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'endUser',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `headUserId` int DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  UNIQUE KEY `code_2` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `departments`
--

LOCK TABLES `departments` WRITE;
/*!40000 ALTER TABLE `departments` DISABLE KEYS */;
INSERT INTO `departments` VALUES (1,'Office of the Mayor','OMAYOR','executive','active',NULL,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(2,'Bids and Awards Committee','BAC','committee','active',NULL,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(3,'BAC Secretariat','BACSEC','committee','active',NULL,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(4,'Technical Working Group','TWG','committee','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(5,'Municipal Budget Office','BUDGET','support','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(6,'Municipal Accounting Office','ACCTG','support','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(7,'Municipal Treasurer\'s Office','TREAS','support','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(8,'General Services Office (GSO)','GSO','endUser','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(9,'Municipal Engineering Office','ENGR','endUser','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(10,'Municipal Health Office','HEALTH','endUser','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(11,'Information Technology Office','IT','endUser','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(12,'Internal Audit Service','INTAUDIT','support','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(13,'Office of the Sangguniang Bayan','SB','executive','active',NULL,'2026-08-06 01:21:30','2026-08-06 01:21:30'),(14,'Municipal Planning and Development Office','MPDO','support','active',NULL,'2026-08-06 01:21:30','2026-08-06 01:21:30');
/*!40000 ALTER TABLE `departments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `developmentgoals`
--

DROP TABLE IF EXISTS `developmentgoals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `developmentgoals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sector` enum('social','economic','infrastructure','environment','institutional') COLLATE utf8mb4_unicode_ci NOT NULL,
  `subsector` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `isMayorPriority` tinyint(1) NOT NULL DEFAULT '0',
  `priorityRank` int DEFAULT NULL,
  `prioritisedAt` datetime DEFAULT NULL,
  `priorityFiscalYear` int DEFAULT NULL,
  `status` enum('active','achieved','dropped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `developmentPlanId` int DEFAULT NULL,
  `prioritisedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `developmentPlanId` (`developmentPlanId`),
  KEY `prioritisedById` (`prioritisedById`),
  KEY `development_goals_sector` (`sector`),
  KEY `development_goals_is_mayor_priority_priority_fiscal_year` (`isMayorPriority`,`priorityFiscalYear`),
  CONSTRAINT `developmentgoals_ibfk_1` FOREIGN KEY (`developmentPlanId`) REFERENCES `developmentplans` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `developmentgoals_ibfk_2` FOREIGN KEY (`prioritisedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `developmentgoals`
--

LOCK TABLES `developmentgoals` WRITE;
/*!40000 ALTER TABLE `developmentgoals` DISABLE KEYS */;
/*!40000 ALTER TABLE `developmentgoals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `developmentplans`
--

DROP TABLE IF EXISTS `developmentplans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `developmentplans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `startYear` int NOT NULL,
  `endYear` int NOT NULL,
  `resolutionNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `adoptedAt` date DEFAULT NULL,
  `status` enum('draft','adopted','superseded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `vision` text COLLATE utf8mb4_unicode_ci,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `preparedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `preparedById` (`preparedById`),
  KEY `development_plans_status` (`status`),
  KEY `development_plans_start_year_end_year` (`startYear`,`endYear`),
  CONSTRAINT `developmentplans_ibfk_1` FOREIGN KEY (`preparedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `developmentplans`
--

LOCK TABLES `developmentplans` WRITE;
/*!40000 ALTER TABLE `developmentplans` DISABLE KEYS */;
/*!40000 ALTER TABLE `developmentplans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `documents`
--

DROP TABLE IF EXISTS `documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mimeType` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sizeBytes` int NOT NULL,
  `content` longblob NOT NULL,
  `checksum` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityRef` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityId` int NOT NULL,
  `docType` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploadedAt` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `uploadedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `documents_entity_ref_entity_id` (`entityRef`,`entityId`),
  KEY `uploadedById` (`uploadedById`),
  CONSTRAINT `documents_ibfk_1` FOREIGN KEY (`uploadedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `documents_ibfk_2` FOREIGN KEY (`uploadedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `documents`
--

LOCK TABLES `documents` WRITE;
/*!40000 ALTER TABLE `documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `evaluations`
--

DROP TABLE IF EXISTS `evaluations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evaluations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `criteriaBreakdown` json NOT NULL,
  `score` decimal(6,2) NOT NULL,
  `blindFlag` tinyint(1) NOT NULL DEFAULT '1',
  `submittedAt` datetime NOT NULL,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `bidId` int DEFAULT NULL,
  `evaluatorId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bidId` (`bidId`),
  KEY `evaluatorId` (`evaluatorId`),
  CONSTRAINT `evaluations_ibfk_1` FOREIGN KEY (`bidId`) REFERENCES `bids` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `evaluations_ibfk_2` FOREIGN KEY (`evaluatorId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `evaluations_ibfk_3` FOREIGN KEY (`bidId`) REFERENCES `bids` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `evaluations_ibfk_4` FOREIGN KEY (`evaluatorId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `evaluations`
--

LOCK TABLES `evaluations` WRITE;
/*!40000 ALTER TABLE `evaluations` DISABLE KEYS */;
/*!40000 ALTER TABLE `evaluations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `executivebudgets`
--

DROP TABLE IF EXISTS `executivebudgets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `executivebudgets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fiscalYear` int NOT NULL,
  `type` enum('annual','supplemental') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'annual',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','pendingMbcReview','pendingPlanningConsolidation','pendingBudgetForum','pendingBudgetHearing','pendingFinalisation','pendingMayorApproval','pendingSanggunianAction','pendingProvincialReview','enacted','returned') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `estimatedIncome` decimal(15,2) DEFAULT NULL,
  `expenditureCeiling` decimal(15,2) DEFAULT NULL,
  `regularIncomePriorYear` decimal(15,2) DEFAULT NULL,
  `nationalTaxAllotment` decimal(15,2) DEFAULT NULL,
  `limitationFindings` json DEFAULT NULL,
  `ceilingGrowthPct` decimal(6,3) DEFAULT NULL,
  `mbcReviewedAt` datetime DEFAULT NULL,
  `consolidatedAt` datetime DEFAULT NULL,
  `forumHeldAt` datetime DEFAULT NULL,
  `hearingConcludedAt` datetime DEFAULT NULL,
  `finalisedAt` datetime DEFAULT NULL,
  `mayorApprovedAt` datetime DEFAULT NULL,
  `ordinanceNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ordinanceDate` date DEFAULT NULL,
  `sanggunianActedAt` datetime DEFAULT NULL,
  `provincialReviewOutcome` enum('approved','deemedApproved','declaredInoperativeInPart','declaredInoperativeInFull') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `provincialReviewedAt` datetime DEFAULT NULL,
  `provincialRemarks` text COLLATE utf8mb4_unicode_ci,
  `enactedAt` datetime DEFAULT NULL,
  `returnRemarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `investmentProgramId` int DEFAULT NULL,
  `preparedById` int DEFAULT NULL,
  `approvedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `investmentProgramId` (`investmentProgramId`),
  KEY `preparedById` (`preparedById`),
  KEY `approvedById` (`approvedById`),
  KEY `executive_budgets_fiscal_year_type` (`fiscalYear`,`type`),
  KEY `executive_budgets_status` (`status`),
  CONSTRAINT `executivebudgets_ibfk_1` FOREIGN KEY (`investmentProgramId`) REFERENCES `investmentprograms` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `executivebudgets_ibfk_2` FOREIGN KEY (`preparedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `executivebudgets_ibfk_3` FOREIGN KEY (`approvedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `executivebudgets`
--

LOCK TABLES `executivebudgets` WRITE;
/*!40000 ALTER TABLE `executivebudgets` DISABLE KEYS */;
/*!40000 ALTER TABLE `executivebudgets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `investmentprograms`
--

DROP TABLE IF EXISTS `investmentprograms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `investmentprograms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fiscalYear` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','pendingMayorEndorsement','pendingSanggunianAdoption','adopted','returned') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `endorsedAt` datetime DEFAULT NULL,
  `adoptedAt` datetime DEFAULT NULL,
  `resolutionNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `returnRemarks` text COLLATE utf8mb4_unicode_ci,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `developmentPlanId` int DEFAULT NULL,
  `preparedById` int DEFAULT NULL,
  `endorsedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fiscalYear` (`fiscalYear`),
  KEY `developmentPlanId` (`developmentPlanId`),
  KEY `preparedById` (`preparedById`),
  KEY `endorsedById` (`endorsedById`),
  KEY `investment_programs_fiscal_year` (`fiscalYear`),
  KEY `investment_programs_status` (`status`),
  CONSTRAINT `investmentprograms_ibfk_1` FOREIGN KEY (`developmentPlanId`) REFERENCES `developmentplans` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `investmentprograms_ibfk_2` FOREIGN KEY (`preparedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `investmentprograms_ibfk_3` FOREIGN KEY (`endorsedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `investmentprograms`
--

LOCK TABLES `investmentprograms` WRITE;
/*!40000 ALTER TABLE `investmentprograms` DISABLE KEYS */;
/*!40000 ALTER TABLE `investmentprograms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoices`
--

DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoiceNo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplierInvoiceRef` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `submittedAt` datetime NOT NULL,
  `status` enum('submitted','certified','returned','paid','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted',
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `contractId` int DEFAULT NULL,
  `deliveryId` int DEFAULT NULL,
  `vendorId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoiceNo` (`invoiceNo`),
  UNIQUE KEY `invoiceNo_2` (`invoiceNo`),
  KEY `contractId` (`contractId`),
  KEY `deliveryId` (`deliveryId`),
  KEY `vendorId` (`vendorId`),
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`contractId`) REFERENCES `contracts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `invoices_ibfk_2` FOREIGN KEY (`deliveryId`) REFERENCES `deliveries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `invoices_ibfk_3` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `invoices_ibfk_4` FOREIGN KEY (`contractId`) REFERENCES `contracts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `invoices_ibfk_5` FOREIGN KEY (`deliveryId`) REFERENCES `deliveries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `invoices_ibfk_6` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoices`
--

LOCK TABLES `invoices` WRITE;
/*!40000 ALTER TABLE `invoices` DISABLE KEYS */;
INSERT INTO `invoices` VALUES (5,'INV-2026-0001','SI-1200',2703500.00,'2026-06-20 01:05:00','paid',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',7,7,7),(6,'INV-2026-0002','SI-1201',8127000.00,'2026-06-21 01:05:00','paid',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',8,8,8);
/*!40000 ALTER TABLE `invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `liveconferencesessions`
--

DROP TABLE IF EXISTS `liveconferencesessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `liveconferencesessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purpose` enum('prebid','clarification','opening','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'prebid',
  `scheduledAt` datetime NOT NULL,
  `meetingUrl` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('scheduled','inProgress','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `minutes` text COLLATE utf8mb4_unicode_ci,
  `startedAt` datetime DEFAULT NULL,
  `endedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `rfqId` int DEFAULT NULL,
  `scheduledById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `rfqId` (`rfqId`),
  KEY `scheduledById` (`scheduledById`),
  CONSTRAINT `liveconferencesessions_ibfk_1` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `liveconferencesessions_ibfk_2` FOREIGN KEY (`scheduledById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `liveconferencesessions_ibfk_3` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `liveconferencesessions_ibfk_4` FOREIGN KEY (`scheduledById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `liveconferencesessions`
--

LOCK TABLES `liveconferencesessions` WRITE;
/*!40000 ALTER TABLE `liveconferencesessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `liveconferencesessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci,
  `link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `refEntity` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `refId` int DEFAULT NULL,
  `severity` enum('info','success','warning','danger') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `readAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `recipientId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notifications_recipient_id_read_at` (`recipientId`,`readAt`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`recipientId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `notifications_ibfk_2` FOREIGN KEY (`recipientId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,'rfq.published','Invitation to observe — ITB-2026-001','Bid evaluation on 8/14/2026, 9:25:28 AM.','/observer/proceedings','rfq',5,'info',NULL,'2026-08-06 01:25:28','2026-08-06 01:25:28',12);
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `obligations`
--

DROP TABLE IF EXISTS `obligations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `obligations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `obligationNo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `status` enum('obligated','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'obligated',
  `certifiedAt` datetime NOT NULL,
  `cancelledAt` datetime DEFAULT NULL,
  `cancellationReason` text COLLATE utf8mb4_unicode_ci,
  `particulars` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `appropriationId` int DEFAULT NULL,
  `certifiedById` int DEFAULT NULL,
  `prHeaderId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `obligationNo` (`obligationNo`),
  UNIQUE KEY `obligationNo_2` (`obligationNo`),
  KEY `obligations_status` (`status`),
  KEY `appropriationId` (`appropriationId`),
  KEY `certifiedById` (`certifiedById`),
  KEY `prHeaderId` (`prHeaderId`),
  CONSTRAINT `obligations_ibfk_1` FOREIGN KEY (`appropriationId`) REFERENCES `appropriations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `obligations_ibfk_2` FOREIGN KEY (`certifiedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `obligations_ibfk_3` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `obligations_ibfk_4` FOREIGN KEY (`appropriationId`) REFERENCES `appropriations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `obligations_ibfk_5` FOREIGN KEY (`certifiedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `obligations_ibfk_6` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `obligations`
--

LOCK TABLES `obligations` WRITE;
/*!40000 ALTER TABLE `obligations` DISABLE KEYS */;
INSERT INTO `obligations` VALUES (9,'ORS-2026-0001',2850000.00,'obligated','2026-02-17 07:10:00',NULL,NULL,'Supply and Delivery of Medical Equipment for the Municipal Health Office','2026-08-06 01:27:01','2026-08-06 01:27:01',11,9,9),(10,'ORS-2026-0002',8400000.00,'obligated','2026-02-18 07:10:00',NULL,NULL,'Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','2026-08-06 01:27:01','2026-08-06 01:27:01',12,9,10),(11,'ORS-2026-0003',4200000.00,'obligated','2026-02-19 07:10:00',NULL,NULL,'Construction of Barangay Malitbog Health Station','2026-08-06 01:27:02','2026-08-06 01:27:02',11,9,11),(12,'ORS-2026-0004',1950000.00,'obligated','2026-02-20 07:10:00',NULL,NULL,'Supply and Delivery of Information Technology Equipment for Municipal Offices','2026-08-06 01:27:02','2026-08-06 01:27:02',13,9,12);
/*!40000 ALTER TABLE `obligations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `observationreports`
--

DROP TABLE IF EXISTS `observationreports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `observationreports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `complianceAssessment` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `areasForImprovement` text COLLATE utf8mb4_unicode_ci,
  `findingsRegular` tinyint(1) NOT NULL DEFAULT '1',
  `submittedAt` datetime NOT NULL,
  `dueAt` datetime NOT NULL,
  `submittedLate` tinyint(1) NOT NULL DEFAULT '0',
  `furnishedTo` json DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `invitationId` int DEFAULT NULL,
  `submittedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `invitationId` (`invitationId`),
  KEY `submittedById` (`submittedById`),
  CONSTRAINT `observationreports_ibfk_1` FOREIGN KEY (`invitationId`) REFERENCES `observerinvitations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `observationreports_ibfk_2` FOREIGN KEY (`submittedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=46 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `observationreports`
--

LOCK TABLES `observationreports` WRITE;
/*!40000 ALTER TABLE `observationreports` DISABLE KEYS */;
INSERT INTO `observationreports` VALUES (1,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-27 06:30:00','2026-03-31 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',4,NULL),(2,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-27 06:30:00','2026-03-31 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',5,NULL),(3,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-27 06:30:00','2026-03-31 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',6,NULL),(4,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the preliminaryExamination stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-27 06:30:00','2026-03-31 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',7,NULL),(5,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the preliminaryExamination stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-27 06:30:00','2026-03-31 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',8,NULL),(6,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the preliminaryExamination stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-27 06:30:00','2026-03-31 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',9,NULL),(7,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the bidEvaluation stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-05 07:45:00','2026-04-09 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',10,NULL),(8,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the bidEvaluation stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-05 07:45:00','2026-04-09 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',11,NULL),(9,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the bidEvaluation stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-05 07:45:00','2026-04-09 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',12,NULL),(10,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the postQualification stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-05 07:45:00','2026-04-09 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',13,NULL),(11,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the postQualification stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-05 07:45:00','2026-04-09 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',14,NULL),(12,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the postQualification stage for ITB-2026-001. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-05 07:45:00','2026-04-09 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',15,NULL),(13,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-28 06:30:00','2026-04-01 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',16,NULL),(14,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-28 06:30:00','2026-04-01 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',17,NULL),(15,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-28 06:30:00','2026-04-01 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',18,NULL),(16,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the prebidConference stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-15 02:00:00','2026-03-19 02:00:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',19,NULL),(17,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the prebidConference stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-15 02:00:00','2026-03-19 02:00:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',20,NULL),(18,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the prebidConference stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-15 02:00:00','2026-03-19 02:00:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',21,NULL),(19,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the preliminaryExamination stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-28 06:30:00','2026-04-01 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',22,NULL),(20,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the preliminaryExamination stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-28 06:30:00','2026-04-01 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',23,NULL),(21,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the preliminaryExamination stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-28 06:30:00','2026-04-01 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',24,NULL),(22,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the bidEvaluation stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-06 07:45:00','2026-04-10 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',25,NULL),(23,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the bidEvaluation stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-06 07:45:00','2026-04-10 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',26,NULL),(24,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the bidEvaluation stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-06 07:45:00','2026-04-10 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',27,NULL),(25,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the postQualification stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-06 07:45:00','2026-04-10 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',28,NULL),(26,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the postQualification stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-06 07:45:00','2026-04-10 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',29,NULL),(27,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the postQualification stage for ITB-2026-002. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-06 07:45:00','2026-04-10 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:01','2026-08-06 01:27:01',30,NULL),(28,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-29 06:30:00','2026-04-02 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',31,NULL),(29,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-29 06:30:00','2026-04-02 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',32,NULL),(30,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-29 06:30:00','2026-04-02 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',33,NULL),(31,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the prebidConference stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-16 02:00:00','2026-03-20 02:00:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',34,NULL),(32,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the prebidConference stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-16 02:00:00','2026-03-20 02:00:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',35,NULL),(33,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the prebidConference stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-16 02:00:00','2026-03-20 02:00:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',36,NULL),(34,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the preliminaryExamination stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-29 06:30:00','2026-04-02 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',37,NULL),(35,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the preliminaryExamination stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-29 06:30:00','2026-04-02 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',38,NULL),(36,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the preliminaryExamination stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-29 06:30:00','2026-04-02 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',39,NULL),(37,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the bidEvaluation stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-07 07:45:00','2026-04-11 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',40,NULL),(38,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the bidEvaluation stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-07 07:45:00','2026-04-11 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',41,NULL),(39,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the bidEvaluation stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-07 07:45:00','2026-04-11 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',42,NULL),(40,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the postQualification stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-07 07:45:00','2026-04-11 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',43,NULL),(41,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the postQualification stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-07 07:45:00','2026-04-11 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',44,NULL),(42,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the postQualification stage for ITB-2026-003. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-04-07 07:45:00','2026-04-11 07:45:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',45,NULL),(43,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-004. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-30 06:30:00','2026-04-03 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',46,NULL),(44,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-004. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-30 06:30:00','2026-04-03 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',47,NULL),(45,'The BAC observed the substantive and procedural requirements of RA 12009 and its IRR at the eligibilityChecking stage for ITB-2026-004. Documents were made available on request and the proceedings were conducted in the presence of the invited observers.','Copies of the abstract of bids could be circulated to observers before the session closes.',1,'2026-03-30 06:30:00','2026-04-03 06:30:00',0,'{\"coa\": true, \"gppb\": true, \"hope\": true, \"philgeps\": true, \"ombudsman\": true}','2026-08-06 01:27:02','2026-08-06 01:27:02',48,NULL);
/*!40000 ALTER TABLE `observationreports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `observerinvitations`
--

DROP TABLE IF EXISTS `observerinvitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `observerinvitations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stage` enum('eligibilityChecking','shortListing','prebidConference','preliminaryExamination','bidEvaluation','postQualification') COLLATE utf8mb4_unicode_ci NOT NULL,
  `scheduledAt` datetime NOT NULL,
  `invitedAt` datetime NOT NULL,
  `noticeDays` int NOT NULL DEFAULT '0',
  `noticeCompliant` tinyint(1) NOT NULL DEFAULT '0',
  `representativeName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidentialityAgreedAt` datetime DEFAULT NULL,
  `attendance` enum('invited','attended','absent','inhibited') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'invited',
  `attendedAt` datetime DEFAULT NULL,
  `inhibitionReason` text COLLATE utf8mb4_unicode_ci,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `rfqId` int DEFAULT NULL,
  `observerOrganizationId` int DEFAULT NULL,
  `invitedById` int DEFAULT NULL,
  `observerUserId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `observerOrganizationId` (`observerOrganizationId`),
  KEY `invitedById` (`invitedById`),
  KEY `observerUserId` (`observerUserId`),
  KEY `observer_invitations_rfq_id_stage` (`rfqId`,`stage`),
  CONSTRAINT `observerinvitations_ibfk_1` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `observerinvitations_ibfk_2` FOREIGN KEY (`observerOrganizationId`) REFERENCES `observerorganizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `observerinvitations_ibfk_3` FOREIGN KEY (`invitedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `observerinvitations_ibfk_4` FOREIGN KEY (`observerUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=49 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `observerinvitations`
--

LOCK TABLES `observerinvitations` WRITE;
/*!40000 ALTER TABLE `observerinvitations` DISABLE KEYS */;
INSERT INTO `observerinvitations` VALUES (4,'eligibilityChecking','2026-03-24 06:30:00','2026-03-17 06:30:00',7,1,'Office of the Resident Auditor','2026-03-17 06:30:00','attended','2026-03-24 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,1,5,NULL),(5,'eligibilityChecking','2026-03-24 06:30:00','2026-03-17 06:30:00',7,1,NULL,'2026-03-17 06:30:00','attended','2026-03-24 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,4,5,NULL),(6,'eligibilityChecking','2026-03-24 06:30:00','2026-03-17 06:30:00',7,1,NULL,'2026-03-17 06:30:00','attended','2026-03-24 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,7,5,NULL),(7,'preliminaryExamination','2026-03-24 06:30:00','2026-03-17 06:30:00',7,1,'Office of the Resident Auditor','2026-03-17 06:30:00','attended','2026-03-24 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,1,5,NULL),(8,'preliminaryExamination','2026-03-24 06:30:00','2026-03-17 06:30:00',7,1,NULL,'2026-03-17 06:30:00','attended','2026-03-24 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,4,5,NULL),(9,'preliminaryExamination','2026-03-24 06:30:00','2026-03-17 06:30:00',7,1,NULL,'2026-03-17 06:30:00','attended','2026-03-24 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,7,5,NULL),(10,'bidEvaluation','2026-04-02 07:45:00','2026-03-26 07:45:00',7,1,'Office of the Resident Auditor','2026-03-26 07:45:00','attended','2026-04-02 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,1,5,NULL),(11,'bidEvaluation','2026-04-02 07:45:00','2026-03-26 07:45:00',7,1,NULL,'2026-03-26 07:45:00','attended','2026-04-02 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,4,5,NULL),(12,'bidEvaluation','2026-04-02 07:45:00','2026-03-26 07:45:00',7,1,NULL,'2026-03-26 07:45:00','attended','2026-04-02 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,7,5,NULL),(13,'postQualification','2026-04-02 07:45:00','2026-03-26 07:45:00',7,1,'Office of the Resident Auditor','2026-03-26 07:45:00','attended','2026-04-02 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,1,5,NULL),(14,'postQualification','2026-04-02 07:45:00','2026-03-26 07:45:00',7,1,NULL,'2026-03-26 07:45:00','attended','2026-04-02 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,4,5,NULL),(15,'postQualification','2026-04-02 07:45:00','2026-03-26 07:45:00',7,1,NULL,'2026-03-26 07:45:00','attended','2026-04-02 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,7,5,NULL),(16,'eligibilityChecking','2026-03-25 06:30:00','2026-03-18 06:30:00',7,1,'Office of the Resident Auditor','2026-03-18 06:30:00','attended','2026-03-25 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,1,5,NULL),(17,'eligibilityChecking','2026-03-25 06:30:00','2026-03-18 06:30:00',7,1,NULL,'2026-03-18 06:30:00','attended','2026-03-25 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,2,5,NULL),(18,'eligibilityChecking','2026-03-25 06:30:00','2026-03-18 06:30:00',7,1,NULL,'2026-03-18 06:30:00','attended','2026-03-25 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,7,5,NULL),(19,'prebidConference','2026-03-12 02:00:00','2026-03-05 02:00:00',7,1,'Office of the Resident Auditor','2026-03-05 02:00:00','attended','2026-03-12 02:00:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,1,5,NULL),(20,'prebidConference','2026-03-12 02:00:00','2026-03-05 02:00:00',7,1,NULL,'2026-03-05 02:00:00','attended','2026-03-12 02:00:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,2,5,NULL),(21,'prebidConference','2026-03-12 02:00:00','2026-03-05 02:00:00',7,1,NULL,'2026-03-05 02:00:00','attended','2026-03-12 02:00:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,7,5,NULL),(22,'preliminaryExamination','2026-03-25 06:30:00','2026-03-18 06:30:00',7,1,'Office of the Resident Auditor','2026-03-18 06:30:00','attended','2026-03-25 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,1,5,NULL),(23,'preliminaryExamination','2026-03-25 06:30:00','2026-03-18 06:30:00',7,1,NULL,'2026-03-18 06:30:00','attended','2026-03-25 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,2,5,NULL),(24,'preliminaryExamination','2026-03-25 06:30:00','2026-03-18 06:30:00',7,1,NULL,'2026-03-18 06:30:00','attended','2026-03-25 06:30:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,7,5,NULL),(25,'bidEvaluation','2026-04-03 07:45:00','2026-03-27 07:45:00',7,1,'Office of the Resident Auditor','2026-03-27 07:45:00','attended','2026-04-03 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,1,5,NULL),(26,'bidEvaluation','2026-04-03 07:45:00','2026-03-27 07:45:00',7,1,NULL,'2026-03-27 07:45:00','attended','2026-04-03 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,2,5,NULL),(27,'bidEvaluation','2026-04-03 07:45:00','2026-03-27 07:45:00',7,1,NULL,'2026-03-27 07:45:00','attended','2026-04-03 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,7,5,NULL),(28,'postQualification','2026-04-03 07:45:00','2026-03-27 07:45:00',7,1,'Office of the Resident Auditor','2026-03-27 07:45:00','attended','2026-04-03 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,1,5,NULL),(29,'postQualification','2026-04-03 07:45:00','2026-03-27 07:45:00',7,1,NULL,'2026-03-27 07:45:00','attended','2026-04-03 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,2,5,NULL),(30,'postQualification','2026-04-03 07:45:00','2026-03-27 07:45:00',7,1,NULL,'2026-03-27 07:45:00','attended','2026-04-03 07:45:00',NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,7,5,NULL),(31,'eligibilityChecking','2026-03-26 06:30:00','2026-03-19 06:30:00',7,1,'Office of the Resident Auditor','2026-03-19 06:30:00','attended','2026-03-26 06:30:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,1,5,NULL),(32,'eligibilityChecking','2026-03-26 06:30:00','2026-03-19 06:30:00',7,1,NULL,'2026-03-19 06:30:00','attended','2026-03-26 06:30:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,2,5,NULL),(33,'eligibilityChecking','2026-03-26 06:30:00','2026-03-19 06:30:00',7,1,NULL,'2026-03-19 06:30:00','attended','2026-03-26 06:30:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,7,5,NULL),(34,'prebidConference','2026-03-13 02:00:00','2026-03-06 02:00:00',7,1,'Office of the Resident Auditor','2026-03-06 02:00:00','attended','2026-03-13 02:00:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,1,5,NULL),(35,'prebidConference','2026-03-13 02:00:00','2026-03-06 02:00:00',7,1,NULL,'2026-03-06 02:00:00','attended','2026-03-13 02:00:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,2,5,NULL),(36,'prebidConference','2026-03-13 02:00:00','2026-03-06 02:00:00',7,1,NULL,'2026-03-06 02:00:00','attended','2026-03-13 02:00:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,7,5,NULL),(37,'preliminaryExamination','2026-03-26 06:30:00','2026-03-19 06:30:00',7,1,'Office of the Resident Auditor','2026-03-19 06:30:00','attended','2026-03-26 06:30:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,1,5,NULL),(38,'preliminaryExamination','2026-03-26 06:30:00','2026-03-19 06:30:00',7,1,NULL,'2026-03-19 06:30:00','attended','2026-03-26 06:30:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,2,5,NULL),(39,'preliminaryExamination','2026-03-26 06:30:00','2026-03-19 06:30:00',7,1,NULL,'2026-03-19 06:30:00','attended','2026-03-26 06:30:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,7,5,NULL),(40,'bidEvaluation','2026-04-04 07:45:00','2026-03-28 07:45:00',7,1,'Office of the Resident Auditor','2026-03-28 07:45:00','attended','2026-04-04 07:45:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,1,5,NULL),(41,'bidEvaluation','2026-04-04 07:45:00','2026-03-28 07:45:00',7,1,NULL,'2026-03-28 07:45:00','attended','2026-04-04 07:45:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,2,5,NULL),(42,'bidEvaluation','2026-04-04 07:45:00','2026-03-28 07:45:00',7,1,NULL,'2026-03-28 07:45:00','attended','2026-04-04 07:45:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,7,5,NULL),(43,'postQualification','2026-04-04 07:45:00','2026-03-28 07:45:00',7,1,'Office of the Resident Auditor','2026-03-28 07:45:00','attended','2026-04-04 07:45:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,1,5,NULL),(44,'postQualification','2026-04-04 07:45:00','2026-03-28 07:45:00',7,1,NULL,'2026-03-28 07:45:00','attended','2026-04-04 07:45:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,2,5,NULL),(45,'postQualification','2026-04-04 07:45:00','2026-03-28 07:45:00',7,1,NULL,'2026-03-28 07:45:00','attended','2026-04-04 07:45:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,7,5,NULL),(46,'eligibilityChecking','2026-03-27 06:30:00','2026-03-20 06:30:00',7,1,'Office of the Resident Auditor','2026-03-20 06:30:00','attended','2026-03-27 06:30:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',12,1,5,NULL),(47,'eligibilityChecking','2026-03-27 06:30:00','2026-03-20 06:30:00',7,1,NULL,'2026-03-20 06:30:00','attended','2026-03-27 06:30:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',12,4,5,NULL),(48,'eligibilityChecking','2026-03-27 06:30:00','2026-03-20 06:30:00',7,1,NULL,'2026-03-20 06:30:00','attended','2026-03-27 06:30:00',NULL,NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',12,7,5,NULL);
/*!40000 ALTER TABLE `observerinvitations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `observerorganizations`
--

DROP TABLE IF EXISTS `observerorganizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `observerorganizations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sector` enum('coa','privateGroup','csoOrPo') COLLATE utf8mb4_unicode_ci NOT NULL,
  `relevantCategories` json DEFAULT NULL,
  `registryBody` enum('sec','cda','coa','none') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sec',
  `registrationNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contactPerson` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contactEmail` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `observerorganizations`
--

LOCK TABLES `observerorganizations` WRITE;
/*!40000 ALTER TABLE `observerorganizations` DISABLE KEYS */;
INSERT INTO `observerorganizations` VALUES (1,'Commission on Audit — Resident Auditor, Municipal Office','coa','[\"goods\", \"infrastructure\", \"consulting\"]','coa',NULL,'Office of the Resident Auditor',NULL,'active',NULL,'2026-08-06 01:24:34','2026-08-06 01:24:34'),(2,'Philippine Constructors Association, Inc. (PCA)','privateGroup','[\"infrastructure\"]','sec','SEC-PCA-000123',NULL,NULL,'active',NULL,'2026-08-06 01:24:34','2026-08-06 01:24:34'),(3,'National Constructors Association of the Philippines, Inc. (NACAP)','privateGroup','[\"infrastructure\"]','sec','SEC-NACAP-000456',NULL,NULL,'active',NULL,'2026-08-06 01:24:34','2026-08-06 01:24:34'),(4,'Philippine Chamber of Commerce and Industry — Provincial Chapter','privateGroup','[\"goods\"]','sec','SEC-PCCI-000789',NULL,NULL,'active',NULL,'2026-08-06 01:24:34','2026-08-06 01:24:34'),(5,'Philippine Institute of Civil Engineers (PICE) — Provincial Chapter','privateGroup','[\"infrastructure\", \"consulting\"]','sec','SEC-PICE-001011',NULL,NULL,'active',NULL,'2026-08-06 01:24:34','2026-08-06 01:24:34'),(6,'Philippine Institute of Certified Public Accountants (PICPA)','privateGroup','[\"consulting\"]','sec','SEC-PICPA-001213',NULL,NULL,'active',NULL,'2026-08-06 01:24:34','2026-08-06 01:24:34'),(7,'Municipal Federation of Peoples Organizations','csoOrPo','[\"goods\", \"infrastructure\", \"consulting\"]','cda','CDA-MFPO-001415',NULL,NULL,'active',NULL,'2026-08-06 01:24:34','2026-08-06 01:24:34'),(8,'Parish Social Action Council — Diocesan Commission on Governance','csoOrPo','[\"goods\", \"infrastructure\", \"consulting\"]','sec','SEC-PSAC-001617',NULL,NULL,'active',NULL,'2026-08-06 01:24:34','2026-08-06 01:24:34');
/*!40000 ALTER TABLE `observerorganizations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `otpchallenges`
--

DROP TABLE IF EXISTS `otpchallenges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `otpchallenges` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reference` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purpose` enum('accountActivation','passwordReset','passwordChange','profileUpdate','bidSubmission') COLLATE utf8mb4_unicode_ci NOT NULL,
  `codeHash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `deliveredTo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiresAt` datetime NOT NULL,
  `consumedAt` datetime DEFAULT NULL,
  `voidedAt` datetime DEFAULT NULL,
  `attempts` int NOT NULL DEFAULT '0',
  `maxAttempts` int NOT NULL DEFAULT '5',
  `ticketHash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ticketExpiresAt` datetime DEFAULT NULL,
  `ticketUsedAt` datetime DEFAULT NULL,
  `contextRef` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contextId` int DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `userId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference` (`reference`),
  UNIQUE KEY `reference_2` (`reference`),
  KEY `otp_challenges_reference` (`reference`),
  KEY `otp_challenges_user_id_purpose` (`userId`,`purpose`),
  CONSTRAINT `otpchallenges_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `otpchallenges_ibfk_2` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `otpchallenges`
--

LOCK TABLES `otpchallenges` WRITE;
/*!40000 ALTER TABLE `otpchallenges` DISABLE KEYS */;
/*!40000 ALTER TABLE `otpchallenges` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `disbursementNo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `grossAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `ewtAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `vatWithheldAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `retentionAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `liquidatedDamages` decimal(15,2) NOT NULL DEFAULT '0.00',
  `otherDeductions` decimal(15,2) NOT NULL DEFAULT '0.00',
  `deductionBreakdown` json DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `preparedAt` datetime DEFAULT NULL,
  `releasedAt` datetime DEFAULT NULL,
  `status` enum('prepared','released','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'prepared',
  `method` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `invoiceId` int DEFAULT NULL,
  `preparedById` int DEFAULT NULL,
  `releasedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `disbursementNo` (`disbursementNo`),
  UNIQUE KEY `disbursementNo_2` (`disbursementNo`),
  KEY `invoiceId` (`invoiceId`),
  KEY `preparedById` (`preparedById`),
  KEY `releasedById` (`releasedById`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`preparedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_3` FOREIGN KEY (`releasedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_4` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_5` FOREIGN KEY (`preparedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_6` FOREIGN KEY (`releasedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
INSERT INTO `payments` VALUES (5,'DV-2026-0001',2703500.00,24138.39,120691.96,0.00,0.00,0.00,'{\"lines\": [{\"base\": 2413839.29, \"rate\": 0.01, \"label\": \"Expanded withholding tax (1% on goods)\", \"amount\": 24138.39}, {\"base\": 2413839.29, \"rate\": 0.05, \"label\": \"Final VAT withheld on government purchase (5%)\", \"amount\": 120691.96}], \"vatComponent\": 289660.71, \"vatRegistered\": true, \"vatExclusiveBase\": 2413839.29, \"taxClassification\": \"goods\"}',2558669.65,'2026-07-01 03:25:00','2026-07-09 06:50:00','released','Check','LBP-480000',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',5,9,10),(6,'DV-2026-0002',8127000.00,145125.00,362812.50,812700.00,0.00,0.00,'{\"lines\": [{\"base\": 7256250, \"rate\": 0.02, \"label\": \"Expanded withholding tax (2% on services)\", \"amount\": 145125}, {\"base\": 7256250, \"rate\": 0.05, \"label\": \"Final VAT withheld on government purchase (5%)\", \"amount\": 362812.5}, {\"base\": 8127000, \"rate\": 0.1, \"label\": \"Retention money (10% — released after final acceptance)\", \"amount\": 812700}], \"vatComponent\": 870750, \"vatRegistered\": true, \"vatExclusiveBase\": 7256250, \"taxClassification\": \"services\"}',6806362.50,'2026-07-02 03:25:00','2026-07-10 06:50:00','released','Check','LBP-480001',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',6,9,10);
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pendingitems`
--

DROP TABLE IF EXISTS `pendingitems`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pendingitems` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reason` enum('notAwarded','failedBidding','cancelled','partiallyDelivered','notDelivered') COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(12,2) DEFAULT NULL,
  `estimatedCost` decimal(15,2) DEFAULT NULL,
  `priority` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `flaggedAt` datetime NOT NULL,
  `resolvedAt` datetime DEFAULT NULL,
  `resolution` enum('carriedForward','reprocured','dropped') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `prLineItemId` int DEFAULT NULL,
  `prHeaderId` int DEFAULT NULL,
  `flaggedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `prLineItemId` (`prLineItemId`),
  KEY `prHeaderId` (`prHeaderId`),
  KEY `flaggedById` (`flaggedById`),
  CONSTRAINT `pendingitems_ibfk_1` FOREIGN KEY (`prLineItemId`) REFERENCES `prlineitems` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pendingitems_ibfk_2` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pendingitems_ibfk_3` FOREIGN KEY (`flaggedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pendingitems_ibfk_4` FOREIGN KEY (`prLineItemId`) REFERENCES `prlineitems` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pendingitems_ibfk_5` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pendingitems_ibfk_6` FOREIGN KEY (`flaggedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pendingitems`
--

LOCK TABLES `pendingitems` WRITE;
/*!40000 ALTER TABLE `pendingitems` DISABLE KEYS */;
/*!40000 ALTER TABLE `pendingitems` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key` (`key`),
  UNIQUE KEY `key_2` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=68 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES (1,'users.manage','administration','Create, edit, and deactivate user accounts','2026-08-05 10:25:25','2026-08-05 10:25:25'),(2,'bidders.createAccount','administration','Create and invite bidder accounts for registrations the BAC has approved','2026-08-05 10:25:25','2026-08-05 10:25:25'),(3,'departments.manage','administration','Create and edit departments','2026-08-05 10:25:25','2026-08-05 10:25:25'),(4,'settings.manage','administration','Change system configuration','2026-08-05 10:25:25','2026-08-05 10:25:25'),(5,'announcements.manage','administration','Write, publish, and withdraw public announcements','2026-08-05 10:25:25','2026-08-05 10:25:25'),(6,'app.view','app','View APP entries','2026-08-05 10:25:25','2026-08-05 10:25:25'),(7,'app.viewPublished','app','View approved/published APP entries only','2026-08-05 10:25:25','2026-08-05 10:25:25'),(8,'app.create','app','Create and edit own APP entries','2026-08-05 10:25:25','2026-08-05 10:25:25'),(9,'app.submit','app','Submit APP entries for consolidation','2026-08-05 10:25:25','2026-08-05 10:25:25'),(10,'app.consolidate','app','Consolidate departmental APP entries','2026-08-05 10:25:25','2026-08-05 10:25:25'),(11,'app.certify','app','Certify funding on APP entries','2026-08-05 10:25:25','2026-08-05 10:25:25'),(12,'app.approve','app','Approve or return the APP','2026-08-05 10:25:25','2026-08-05 10:25:25'),(13,'pr.view','pr','View purchase requisitions','2026-08-05 10:25:25','2026-08-05 10:25:25'),(14,'pr.create','pr','Create and submit purchase requisitions','2026-08-05 10:25:25','2026-08-05 10:25:25'),(15,'pr.endorse','pr','Endorse requisitions as department head','2026-08-05 10:25:25','2026-08-05 10:25:25'),(16,'pr.certify','pr','Certify existence of appropriation on requisitions','2026-08-05 10:25:25','2026-08-05 10:25:25'),(17,'pr.certifyCash','pr','Certify availability of funds in the treasury (LGC Sec. 344)','2026-08-05 10:25:25','2026-08-05 10:25:25'),(18,'pr.review','pr','Review requisitions as Secretariat','2026-08-05 10:25:25','2026-08-05 10:25:25'),(19,'pr.approve','pr','Give final approval on requisitions','2026-08-05 10:25:25','2026-08-05 10:25:25'),(20,'bidding.view','bidding','View bidding records','2026-08-05 10:25:25','2026-08-05 10:25:25'),(21,'bidding.viewPublished','bidding','View approved bidding records only','2026-08-05 10:25:25','2026-08-05 10:25:25'),(22,'bidding.publish','bidding','Publish RFQ/ITB and open bids','2026-08-05 10:25:25','2026-08-05 10:25:25'),(23,'bidding.submitBid','bidding','Submit a bid or quotation','2026-08-05 10:25:25','2026-08-05 10:25:25'),(24,'bidding.evaluate','bidding','Score bids against the rubric','2026-08-05 10:25:25','2026-08-05 10:25:25'),(25,'bidding.technicalInput','bidding','Provide TWG technical evaluation input','2026-08-05 10:25:25','2026-08-05 10:25:25'),(26,'bidding.chairEvaluation','bidding','Chair evaluation and resolve award','2026-08-05 10:25:25','2026-08-05 10:25:25'),(27,'bidding.approveAlternativeMode','bidding','Approve alternative procurement modes','2026-08-05 10:25:25','2026-08-05 10:25:25'),(28,'bidding.award','bidding','Approve and issue the award','2026-08-05 10:25:25','2026-08-05 10:25:25'),(29,'contract.view','contract','View contracts','2026-08-05 10:25:25','2026-08-05 10:25:25'),(30,'contract.viewPublished','contract','View approved contracts only','2026-08-05 10:25:25','2026-08-05 10:25:25'),(31,'contract.draft','contract','Draft contracts and purchase orders','2026-08-05 10:25:25','2026-08-05 10:25:25'),(32,'contract.sign','contract','Sign contracts','2026-08-05 10:25:25','2026-08-05 10:25:25'),(33,'delivery.report','delivery','Submit delivery and acceptance reports','2026-08-05 10:25:25','2026-08-05 10:25:25'),(34,'delivery.submitInvoice','delivery','Submit invoices as a supplier','2026-08-05 10:25:25','2026-08-05 10:25:25'),(35,'payment.view','delivery','View invoices and disbursement vouchers','2026-08-05 10:25:25','2026-08-05 10:25:25'),(36,'payment.certify','delivery','Certify invoices and prepare disbursement vouchers','2026-08-05 10:25:25','2026-08-05 10:25:25'),(37,'payment.release','delivery','Release disbursements from the treasury','2026-08-05 10:25:25','2026-08-05 10:25:25'),(38,'budget.view','budget','View budget and certification status','2026-08-05 10:25:25','2026-08-05 10:25:25'),(39,'budget.certify','budget','Certify availability of funds','2026-08-05 10:25:25','2026-08-05 10:25:25'),(40,'budget.manageAppropriations','budget','Record and amend appropriation ordinance lines','2026-08-05 10:25:25','2026-08-05 10:25:25'),(41,'audit.viewLogs','audit','View system logs','2026-08-05 10:25:25','2026-08-05 10:25:25'),(42,'audit.viewAll','audit','View full workflow history across modules','2026-08-05 10:25:25','2026-08-05 10:25:25'),(43,'audit.viewPublished','audit','View published transparency records only','2026-08-05 10:25:25','2026-08-05 10:25:25'),(44,'audit.export','audit','Export audit records','2026-08-05 10:25:25','2026-08-05 10:25:25'),(45,'planning.view','planning','View development plans and investment programs','2026-08-06 01:21:30','2026-08-06 01:21:30'),(46,'planning.manageCdp','planning','Prepare and maintain the Comprehensive Development Plan and its goals','2026-08-06 01:21:30','2026-08-06 01:21:30'),(47,'planning.setPriorities','planning','Set the Mayor\'s priority goals and endorse the investment program','2026-08-06 01:21:30','2026-08-06 01:21:30'),(48,'planning.manageAip','planning','Prepare the Annual Investment Program','2026-08-06 01:21:30','2026-08-06 01:21:30'),(49,'planning.adoptAip','planning','Record the Sanggunian\'s adoption of the investment program','2026-08-06 01:21:30','2026-08-06 01:21:30'),(50,'app.revise','app','Reopen or cancel an approved APP/PPMP line when a project changes','2026-08-06 01:21:30','2026-08-06 01:21:30'),(51,'pr.obligate','pr','Obligate the appropriation and raise the ORS (LGC Sec. 344)','2026-08-06 01:21:30','2026-08-06 01:21:30'),(52,'pr.determineMode','pr','Determine the mode of procurement for an approved requisition','2026-08-06 01:21:30','2026-08-06 01:21:30'),(53,'observer.manage','bidding','Maintain the observer roster and invite observers to BAC proceedings','2026-08-06 01:21:30','2026-08-06 01:21:30'),(54,'observer.participate','bidding','Attend BAC proceedings as an invited observer and file observation reports','2026-08-06 01:21:30','2026-08-06 01:21:30'),(55,'protest.file','bidding','File a request for reconsideration or protest as a bidder','2026-08-06 01:21:30','2026-08-06 01:21:30'),(56,'protest.resolve','bidding','Decide requests for reconsideration as the BAC','2026-08-06 01:21:30','2026-08-06 01:21:30'),(57,'protest.decide','bidding','Resolve protests as the Head of the Procuring Entity','2026-08-06 01:21:30','2026-08-06 01:21:30'),(58,'budget.proposeBudget','budget','Prepare and submit an office\'s budget proposal','2026-08-06 01:21:30','2026-08-06 01:21:30'),(59,'budget.prepareExecutive','budget','Open a fiscal year for proposals and administer the budget calendar','2026-08-06 01:21:30','2026-08-06 01:21:30'),(60,'budget.reviewProposal','budget','Review departmental budget proposals as the Municipal Budget Council','2026-08-06 01:21:30','2026-08-06 01:21:30'),(61,'budget.consolidateProposals','budget','Consolidate proposals against the development plan (Planning Office)','2026-08-06 01:21:30','2026-08-06 01:21:30'),(62,'budget.conductForum','budget','Conduct the budget forum and set income estimates and ceilings (LFC)','2026-08-06 01:21:30','2026-08-06 01:21:30'),(63,'budget.conductHearing','budget','Conduct budget hearings and record their minutes (LFC)','2026-08-06 01:21:30','2026-08-06 01:21:30'),(64,'budget.finaliseExecutive','budget','Strike the final figures and assemble the executive budget','2026-08-06 01:21:30','2026-08-06 01:21:30'),(65,'budget.approveExecutive','budget','Approve the executive budget and submit it to the Sanggunian (LGC Sec. 318)','2026-08-06 01:21:30','2026-08-06 01:21:30'),(66,'budget.enactOrdinance','budget','Record the Sangguniang Bayan\'s Appropriation Ordinance (LGC Sec. 319)','2026-08-06 01:21:30','2026-08-06 01:21:30'),(67,'budget.recordProvincialReview','budget','Record the Sangguniang Panlalawigan\'s review of the ordinance (LGC Sec. 327)','2026-08-06 01:21:30','2026-08-06 01:21:30');
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `postqualifications`
--

DROP TABLE IF EXISTS `postqualifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `postqualifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `checklist` json DEFAULT NULL,
  `result` enum('passed','failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `verifiedAt` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `bidId` int DEFAULT NULL,
  `verifiedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bidId` (`bidId`),
  KEY `verifiedById` (`verifiedById`),
  CONSTRAINT `postqualifications_ibfk_1` FOREIGN KEY (`bidId`) REFERENCES `bids` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `postqualifications_ibfk_2` FOREIGN KEY (`verifiedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `postqualifications_ibfk_3` FOREIGN KEY (`bidId`) REFERENCES `bids` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `postqualifications_ibfk_4` FOREIGN KEY (`verifiedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `postqualifications`
--

LOCK TABLES `postqualifications` WRITE;
/*!40000 ALTER TABLE `postqualifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `postqualifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `prheaders`
--

DROP TABLE IF EXISTS `prheaders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prheaders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `prNumber` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purpose` text COLLATE utf8mb4_unicode_ci,
  `dateRequired` date NOT NULL,
  `isEmergency` tinyint(1) NOT NULL DEFAULT '0',
  `justification` text COLLATE utf8mb4_unicode_ci,
  `totalAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status` enum('draft','pendingDepartmentHeadEndorsement','pendingCashCertification','pendingMayorApproval','pendingBudgetCertification','pendingAccountantObligation','pendingModeDetermination','returned','approved') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `returnRemarks` text COLLATE utf8mb4_unicode_ci,
  `fundsReservedAt` datetime DEFAULT NULL,
  `cashCertifiedAt` datetime DEFAULT NULL,
  `submittedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `appEntryId` int DEFAULT NULL,
  `requesterId` int DEFAULT NULL,
  `departmentId` int DEFAULT NULL,
  `cashCertifiedById` int DEFAULT NULL,
  `appropriationCertifiedAt` datetime DEFAULT NULL,
  `mayorApprovedAt` datetime DEFAULT NULL,
  `fundSource` enum('generalFund','specialEducationFund','trustFund') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `modeDeterminedAt` datetime DEFAULT NULL,
  `modeJustification` text COLLATE utf8mb4_unicode_ci,
  `suggestedModeKey` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mayorApprovedById` int DEFAULT NULL,
  `modeDeterminedById` int DEFAULT NULL,
  `appropriationCertifiedById` int DEFAULT NULL,
  `obligatedById` int DEFAULT NULL,
  `procurementModeId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `prNumber` (`prNumber`),
  UNIQUE KEY `prNumber_2` (`prNumber`),
  KEY `pr_headers_status` (`status`),
  KEY `PrHeaders_mayorApprovedById_foreign_idx` (`mayorApprovedById`),
  KEY `PrHeaders_modeDeterminedById_foreign_idx` (`modeDeterminedById`),
  KEY `PrHeaders_appropriationCertifiedById_foreign_idx` (`appropriationCertifiedById`),
  KEY `PrHeaders_obligatedById_foreign_idx` (`obligatedById`),
  KEY `PrHeaders_procurementModeId_foreign_idx` (`procurementModeId`),
  KEY `appEntryId` (`appEntryId`),
  KEY `requesterId` (`requesterId`),
  KEY `departmentId` (`departmentId`),
  KEY `cashCertifiedById` (`cashCertifiedById`),
  CONSTRAINT `PrHeaders_appropriationCertifiedById_foreign_idx` FOREIGN KEY (`appropriationCertifiedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_1` FOREIGN KEY (`appEntryId`) REFERENCES `appentries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_2` FOREIGN KEY (`requesterId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_3` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_4` FOREIGN KEY (`cashCertifiedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_5` FOREIGN KEY (`appEntryId`) REFERENCES `appentries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_6` FOREIGN KEY (`requesterId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_7` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_8` FOREIGN KEY (`cashCertifiedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PrHeaders_mayorApprovedById_foreign_idx` FOREIGN KEY (`mayorApprovedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PrHeaders_modeDeterminedById_foreign_idx` FOREIGN KEY (`modeDeterminedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PrHeaders_obligatedById_foreign_idx` FOREIGN KEY (`obligatedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PrHeaders_procurementModeId_foreign_idx` FOREIGN KEY (`procurementModeId`) REFERENCES `procurementmodes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prheaders`
--

LOCK TABLES `prheaders` WRITE;
/*!40000 ALTER TABLE `prheaders` DISABLE KEYS */;
INSERT INTO `prheaders` VALUES (9,'PR-2026-0001','Supply and Delivery of Medical Equipment for the Municipal Health Office','2026-05-01',0,NULL,2850000.00,'approved',NULL,'2026-02-17 07:10:00','2026-02-11 05:30:00','2026-02-05 00:50:00','2026-08-06 01:27:01','2026-08-06 01:27:01',13,7,10,10,'2026-02-17 07:10:00','2026-02-15 02:05:00','generalFund','2026-02-21 03:25:00','Determined per IRR Sec. 26: the ABC exceeds this LGU\'s Small Value Procurement ceiling, so competitive bidding applies.','competitiveBidding',2,3,8,9,1),(10,'PR-2026-0002','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','2026-05-02',0,NULL,8400000.00,'approved',NULL,'2026-02-18 07:10:00','2026-02-12 05:30:00','2026-02-06 00:50:00','2026-08-06 01:27:01','2026-08-06 01:27:01',14,7,9,10,'2026-02-18 07:10:00','2026-02-16 02:05:00','generalFund','2026-02-22 03:25:00','Determined per IRR Sec. 26: the ABC exceeds this LGU\'s Small Value Procurement ceiling, so competitive bidding applies.','competitiveBidding',2,3,8,9,1),(11,'PR-2026-0003','Construction of Barangay Malitbog Health Station','2026-05-03',0,NULL,4200000.00,'approved',NULL,'2026-02-19 07:10:00','2026-02-13 05:30:00','2026-02-07 00:50:00','2026-08-06 01:27:02','2026-08-06 01:27:02',15,7,10,10,'2026-02-19 07:10:00','2026-02-17 02:05:00','generalFund','2026-02-23 03:25:00','Determined per IRR Sec. 26: the ABC exceeds this LGU\'s Small Value Procurement ceiling, so competitive bidding applies.','competitiveBidding',2,3,8,9,1),(12,'PR-2026-0004','Supply and Delivery of Information Technology Equipment for Municipal Offices','2026-05-04',0,NULL,1950000.00,'approved',NULL,'2026-02-20 07:10:00','2026-02-14 05:30:00','2026-02-08 00:50:00','2026-08-06 01:27:02','2026-08-06 01:27:02',16,7,11,10,'2026-02-20 07:10:00','2026-02-18 02:05:00','generalFund','2026-02-24 03:25:00','Determined per IRR Sec. 26: the ABC exceeds this LGU\'s Small Value Procurement ceiling, so competitive bidding applies.','competitiveBidding',2,3,8,9,1);
/*!40000 ALTER TABLE `prheaders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `prlineitems`
--

DROP TABLE IF EXISTS `prlineitems`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prlineitems` (
  `id` int NOT NULL AUTO_INCREMENT,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `unitCost` decimal(15,2) NOT NULL,
  `lineTotal` decimal(15,2) NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `prHeaderId` int DEFAULT NULL,
  `hasUsefulLifeOverOneYear` tinyint(1) NOT NULL DEFAULT '0',
  `assetClass` enum('expense','semiExpendable','capitalOutlay') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'expense',
  PRIMARY KEY (`id`),
  KEY `prHeaderId` (`prHeaderId`),
  CONSTRAINT `prlineitems_ibfk_1` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `prlineitems_ibfk_2` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prlineitems`
--

LOCK TABLES `prlineitems` WRITE;
/*!40000 ALTER TABLE `prlineitems` DISABLE KEYS */;
INSERT INTO `prlineitems` VALUES (9,'Supply and Delivery of Medical Equipment for the Municipal Health Office','lot',1.00,2850000.00,2850000.00,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,0,'expense'),(10,'Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','lot',1.00,8400000.00,8400000.00,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,0,'expense'),(11,'Construction of Barangay Malitbog Health Station','lot',1.00,4200000.00,4200000.00,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,0,'expense'),(12,'Supply and Delivery of Information Technology Equipment for Municipal Offices','lot',1.00,1950000.00,1950000.00,'2026-08-06 01:27:02','2026-08-06 01:27:02',12,0,'expense');
/*!40000 ALTER TABLE `prlineitems` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `procurementmodes`
--

DROP TABLE IF EXISTS `procurementmodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `procurementmodes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `isDefault` tinyint(1) NOT NULL DEFAULT '0',
  `requiresJustification` tinyint(1) NOT NULL DEFAULT '1',
  `requiresHopeApproval` tinyint(1) NOT NULL DEFAULT '0',
  `citation` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sortOrder` int NOT NULL DEFAULT '0',
  `requiresCompetitiveBidding` tinyint(1) NOT NULL DEFAULT '1',
  `minimumOffers` int NOT NULL DEFAULT '2',
  `allowsDirectAward` tinyint(1) NOT NULL DEFAULT '0',
  `requiresBidSecurity` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key` (`key`),
  UNIQUE KEY `key_2` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `procurementmodes`
--

LOCK TABLES `procurementmodes` WRITE;
/*!40000 ALTER TABLE `procurementmodes` DISABLE KEYS */;
INSERT INTO `procurementmodes` VALUES (1,'competitiveBidding','Competitive Bidding',1,0,0,'IRR Sec. 26',1,1,2,0,1,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(2,'limitedSourceBidding','Limited Source Bidding',0,1,1,'IRR Sec. 28',2,1,2,0,1,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(3,'competitiveDialogue','Competitive Dialogue',0,1,1,'IRR Sec. 29',3,1,2,0,1,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(4,'unsolicitedOffer','Unsolicited Offer with Bid Matching',0,1,1,'IRR Sec. 30',4,1,1,0,1,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(5,'directContracting','Direct Contracting',0,1,1,'IRR Sec. 31',5,0,1,1,0,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(6,'directAcquisition','Direct Acquisition',0,1,0,'IRR Sec. 32',6,0,1,1,0,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(7,'repeatOrder','Repeat Order',0,1,1,'IRR Sec. 33',7,0,1,1,0,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(8,'smallValueProcurement','Small Value Procurement',0,1,0,'IRR Sec. 34',8,0,3,0,0,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(9,'negotiatedProcurement','Negotiated Procurement',0,1,1,'IRR Sec. 35',9,0,1,1,0,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(10,'directSales','Direct Sales',0,1,1,'IRR Sec. 36',10,0,1,1,0,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(11,'stiProcurement','Direct Procurement for Science, Technology, and Innovation',0,1,1,'IRR Sec. 37',11,0,1,1,0,'2026-08-05 10:25:25','2026-08-05 10:25:25');
/*!40000 ALTER TABLE `procurementmodes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `protests`
--

DROP TABLE IF EXISTS `protests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `protests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stage` enum('requestForReconsideration','protest') COLLATE utf8mb4_unicode_ci NOT NULL,
  `challengedDecision` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notifiedAt` datetime NOT NULL,
  `filedAt` datetime NOT NULL,
  `filingDays` int NOT NULL DEFAULT '0',
  `filedOnTime` tinyint(1) NOT NULL DEFAULT '1',
  `grounds` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `verifiedByAffidavit` tinyint(1) NOT NULL DEFAULT '0',
  `noForumShoppingCertified` tinyint(1) NOT NULL DEFAULT '0',
  `protestFee` decimal(15,2) DEFAULT NULL,
  `protestFeePaidAt` datetime DEFAULT NULL,
  `protestFeeReference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('filed','granted','denied','withdrawn','dismissed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'filed',
  `decision` text COLLATE utf8mb4_unicode_ci,
  `decidedAt` datetime DEFAULT NULL,
  `dueAt` datetime NOT NULL,
  `decidedLate` tinyint(1) NOT NULL DEFAULT '0',
  `finalAndExecutory` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `rfqId` int DEFAULT NULL,
  `vendorId` int DEFAULT NULL,
  `filedById` int DEFAULT NULL,
  `decidedById` int DEFAULT NULL,
  `reconsiderationId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `vendorId` (`vendorId`),
  KEY `filedById` (`filedById`),
  KEY `decidedById` (`decidedById`),
  KEY `reconsiderationId` (`reconsiderationId`),
  KEY `protests_rfq_id_stage` (`rfqId`,`stage`),
  KEY `protests_status` (`status`),
  CONSTRAINT `protests_ibfk_1` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `protests_ibfk_2` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `protests_ibfk_3` FOREIGN KEY (`filedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `protests_ibfk_4` FOREIGN KEY (`decidedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `protests_ibfk_5` FOREIGN KEY (`reconsiderationId`) REFERENCES `protests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `protests`
--

LOCK TABLES `protests` WRITE;
/*!40000 ALTER TABLE `protests` DISABLE KEYS */;
/*!40000 ALTER TABLE `protests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rfqs`
--

DROP TABLE IF EXISTS `rfqs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rfqs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referenceNo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `abc` decimal(15,2) NOT NULL,
  `category` enum('goods','infrastructure','consulting') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'goods',
  `publishDate` date DEFAULT NULL,
  `closingDate` datetime NOT NULL,
  `prebidRequired` tinyint(1) NOT NULL DEFAULT '0',
  `prebidAt` datetime DEFAULT NULL,
  `postingRequired` tinyint(1) NOT NULL DEFAULT '1',
  `status` enum('draft','published','closed','opened','evaluated','awarded','cancelled','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `cancellationReason` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `prHeaderId` int DEFAULT NULL,
  `procurementModeId` int DEFAULT NULL,
  `publishedById` int DEFAULT NULL,
  `philgepsPostedAt` datetime DEFAULT NULL,
  `philgepsReference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isEarlyProcurement` tinyint(1) NOT NULL DEFAULT '0',
  `appEntryId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `referenceNo` (`referenceNo`),
  UNIQUE KEY `referenceNo_2` (`referenceNo`),
  KEY `Rfqs_appEntryId_foreign_idx` (`appEntryId`),
  KEY `prHeaderId` (`prHeaderId`),
  KEY `procurementModeId` (`procurementModeId`),
  KEY `publishedById` (`publishedById`),
  CONSTRAINT `Rfqs_appEntryId_foreign_idx` FOREIGN KEY (`appEntryId`) REFERENCES `appentries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rfqs_ibfk_1` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rfqs_ibfk_2` FOREIGN KEY (`procurementModeId`) REFERENCES `procurementmodes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rfqs_ibfk_3` FOREIGN KEY (`publishedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rfqs_ibfk_4` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rfqs_ibfk_5` FOREIGN KEY (`procurementModeId`) REFERENCES `procurementmodes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rfqs_ibfk_6` FOREIGN KEY (`publishedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rfqs`
--

LOCK TABLES `rfqs` WRITE;
/*!40000 ALTER TABLE `rfqs` DISABLE KEYS */;
INSERT INTO `rfqs` VALUES (9,'ITB-2026-001','Supply and Delivery of Medical Equipment for the Municipal Health Office',2850000.00,'goods','2026-03-03','2026-03-24 06:00:00',0,NULL,1,'awarded',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,1,5,NULL,NULL,0,NULL),(10,'ITB-2026-002','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)',8400000.00,'infrastructure','2026-03-04','2026-03-25 06:00:00',1,'2026-03-12 02:00:00',1,'awarded',NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',10,1,5,NULL,NULL,0,NULL),(11,'ITB-2026-003','Construction of Barangay Malitbog Health Station',4200000.00,'infrastructure','2026-03-05','2026-03-26 06:00:00',1,'2026-03-13 02:00:00',1,'awarded',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',11,1,5,NULL,NULL,0,NULL),(12,'ITB-2026-004','Supply and Delivery of Information Technology Equipment for Municipal Offices',1950000.00,'goods','2026-07-28','2026-08-18 06:00:00',0,NULL,1,'published',NULL,'2026-08-06 01:27:02','2026-08-06 01:27:02',12,1,5,NULL,NULL,0,NULL);
/*!40000 ALTER TABLE `rfqs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rolepermissions`
--

DROP TABLE IF EXISTS `rolepermissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rolepermissions` (
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `roleId` int NOT NULL,
  `permissionId` int NOT NULL,
  PRIMARY KEY (`roleId`,`permissionId`),
  KEY `permissionId` (`permissionId`),
  CONSTRAINT `rolepermissions_ibfk_1` FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `rolepermissions_ibfk_2` FOREIGN KEY (`permissionId`) REFERENCES `permissions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rolepermissions`
--

LOCK TABLES `rolepermissions` WRITE;
/*!40000 ALTER TABLE `rolepermissions` DISABLE KEYS */;
INSERT INTO `rolepermissions` VALUES ('2026-08-05 10:25:26','2026-08-05 10:25:26',1,1),('2026-08-05 10:25:26','2026-08-05 10:25:26',1,2),('2026-08-05 10:25:26','2026-08-05 10:25:26',1,3),('2026-08-05 10:25:26','2026-08-05 10:25:26',1,4),('2026-08-05 10:25:26','2026-08-05 10:25:26',1,5),('2026-08-05 10:25:26','2026-08-05 10:25:26',1,41),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,6),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,12),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,13),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,19),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,20),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,27),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,28),('2026-08-06 01:21:30','2026-08-06 01:21:30',2,29),('2026-08-06 01:21:30','2026-08-06 01:21:30',2,32),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,38),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,42),('2026-08-06 01:21:30','2026-08-06 01:21:30',2,45),('2026-08-06 01:21:30','2026-08-06 01:21:30',2,47),('2026-08-06 01:21:30','2026-08-06 01:21:30',2,57),('2026-08-06 01:21:30','2026-08-06 01:21:30',2,65),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,6),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,13),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,20),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,24),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,26),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,29),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,38),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,42),('2026-08-06 01:21:30','2026-08-06 01:21:30',3,52),('2026-08-06 01:21:30','2026-08-06 01:21:30',3,56),('2026-08-05 10:25:26','2026-08-05 10:25:26',4,6),('2026-08-05 10:25:26','2026-08-05 10:25:26',4,13),('2026-08-05 10:25:26','2026-08-05 10:25:26',4,20),('2026-08-05 10:25:26','2026-08-05 10:25:26',4,24),('2026-08-05 10:25:26','2026-08-05 10:25:26',4,38),('2026-08-06 01:21:31','2026-08-06 01:21:31',4,56),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,5),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,6),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,10),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,13),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,18),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,20),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,22),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,29),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,31),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,38),('2026-08-06 01:21:31','2026-08-06 01:21:31',5,45),('2026-08-06 01:21:31','2026-08-06 01:21:31',5,50),('2026-08-06 01:21:31','2026-08-06 01:21:31',5,53),('2026-08-05 10:25:27','2026-08-05 10:25:27',6,6),('2026-08-05 10:25:27','2026-08-05 10:25:27',6,13),('2026-08-05 10:25:27','2026-08-05 10:25:27',6,20),('2026-08-05 10:25:27','2026-08-05 10:25:27',6,25),('2026-08-05 10:25:27','2026-08-05 10:25:27',6,38),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,6),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,8),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,9),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,13),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,14),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,33),('2026-08-06 01:21:31','2026-08-06 01:21:31',7,38),('2026-08-06 01:21:31','2026-08-06 01:21:31',7,45),('2026-08-06 01:21:31','2026-08-06 01:21:31',7,50),('2026-08-06 01:21:31','2026-08-06 01:21:31',7,58),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,6),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,11),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,13),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,16),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,38),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,39),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,40),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,42),('2026-08-06 01:21:31','2026-08-06 01:21:31',8,45),('2026-08-06 01:21:31','2026-08-06 01:21:31',8,59),('2026-08-06 01:21:31','2026-08-06 01:21:31',8,60),('2026-08-06 01:21:31','2026-08-06 01:21:31',8,62),('2026-08-06 01:21:31','2026-08-06 01:21:31',8,63),('2026-08-06 01:21:31','2026-08-06 01:21:31',8,64),('2026-08-06 01:21:31','2026-08-06 01:21:31',9,13),('2026-08-05 10:25:28','2026-08-05 10:25:28',9,35),('2026-08-05 10:25:28','2026-08-05 10:25:28',9,36),('2026-08-05 10:25:28','2026-08-05 10:25:28',9,38),('2026-08-05 10:25:28','2026-08-05 10:25:28',9,42),('2026-08-06 01:21:31','2026-08-06 01:21:31',9,51),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,13),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,17),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,35),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,37),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,38),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,42),('2026-08-06 01:21:31','2026-08-06 01:21:31',10,45),('2026-08-06 01:21:31','2026-08-06 01:21:31',10,62),('2026-08-06 01:21:31','2026-08-06 01:21:31',10,63),('2026-08-05 10:25:29','2026-08-05 10:25:29',11,23),('2026-08-05 10:25:29','2026-08-05 10:25:29',11,32),('2026-08-05 10:25:29','2026-08-05 10:25:29',11,34),('2026-08-06 01:21:31','2026-08-06 01:21:31',11,55),('2026-08-05 10:25:30','2026-08-05 10:25:30',12,7),('2026-08-05 10:25:30','2026-08-05 10:25:30',12,21),('2026-08-05 10:25:30','2026-08-05 10:25:30',12,30),('2026-08-05 10:25:30','2026-08-05 10:25:30',12,43),('2026-08-06 01:21:32','2026-08-06 01:21:32',12,54),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,6),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,13),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,20),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,29),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,38),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,41),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,42),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,44),('2026-08-06 01:21:32','2026-08-06 01:21:32',13,45),('2026-08-06 01:21:30','2026-08-06 01:21:30',14,6),('2026-08-06 01:21:30','2026-08-06 01:21:30',14,13),('2026-08-06 01:21:30','2026-08-06 01:21:30',14,20),('2026-08-06 01:21:30','2026-08-06 01:21:30',14,24),('2026-08-06 01:21:30','2026-08-06 01:21:30',14,26),('2026-08-06 01:21:30','2026-08-06 01:21:30',14,29),('2026-08-06 01:21:30','2026-08-06 01:21:30',14,38),('2026-08-06 01:21:30','2026-08-06 01:21:30',14,42),('2026-08-06 01:21:30','2026-08-06 01:21:30',14,52),('2026-08-06 01:21:30','2026-08-06 01:21:30',14,56),('2026-08-06 01:21:31','2026-08-06 01:21:31',15,6),('2026-08-06 01:21:31','2026-08-06 01:21:31',15,38),('2026-08-06 01:21:31','2026-08-06 01:21:31',15,42),('2026-08-06 01:21:31','2026-08-06 01:21:31',15,45),('2026-08-06 01:21:31','2026-08-06 01:21:31',15,46),('2026-08-06 01:21:31','2026-08-06 01:21:31',15,48),('2026-08-06 01:21:31','2026-08-06 01:21:31',15,60),('2026-08-06 01:21:31','2026-08-06 01:21:31',15,61),('2026-08-06 01:21:31','2026-08-06 01:21:31',15,62),('2026-08-06 01:21:31','2026-08-06 01:21:31',15,63),('2026-08-06 01:21:31','2026-08-06 01:21:31',16,6),('2026-08-06 01:21:31','2026-08-06 01:21:31',16,38),('2026-08-06 01:21:31','2026-08-06 01:21:31',16,42),('2026-08-06 01:21:31','2026-08-06 01:21:31',16,45),('2026-08-06 01:21:31','2026-08-06 01:21:31',16,49),('2026-08-06 01:21:31','2026-08-06 01:21:31',16,66),('2026-08-06 01:21:31','2026-08-06 01:21:31',16,67);
/*!40000 ALTER TABLE `rolepermissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `defaultDepartmentId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key` (`key`),
  UNIQUE KEY `key_2` (`key`),
  KEY `defaultDepartmentId` (`defaultDepartmentId`),
  CONSTRAINT `roles_ibfk_1` FOREIGN KEY (`defaultDepartmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `roles_ibfk_2` FOREIGN KEY (`defaultDepartmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'systemAdministrator','System Administrator','2026-08-05 10:25:26','2026-08-05 10:25:26',11),(2,'hope','HOPE (Municipal Mayor)','2026-08-05 10:25:26','2026-08-05 10:25:26',1),(3,'bacChairperson','BAC Chairperson','2026-08-05 10:25:26','2026-08-05 10:25:26',2),(4,'bacMember','BAC Member','2026-08-05 10:25:26','2026-08-05 10:25:26',2),(5,'bacSecretariat','BAC Secretariat','2026-08-05 10:25:27','2026-08-05 10:25:27',3),(6,'twgMember','TWG Member','2026-08-05 10:25:27','2026-08-05 10:25:27',4),(7,'departmentRequester','Department Requester','2026-08-05 10:25:27','2026-08-05 10:25:27',9),(8,'budgetOfficer','Budget Officer','2026-08-05 10:25:28','2026-08-05 10:25:28',5),(9,'municipalAccountant','Municipal Accountant','2026-08-05 10:25:28','2026-08-05 10:25:28',6),(10,'municipalTreasurer','Municipal Treasurer','2026-08-05 10:25:29','2026-08-05 10:25:29',7),(11,'vendor','Vendor / Supplier','2026-08-05 10:25:29','2026-08-05 10:25:29',NULL),(12,'observer','Observer / Public Auditor','2026-08-05 10:25:30','2026-08-05 10:25:30',NULL),(13,'internalAuditor','Internal Auditor','2026-08-05 10:25:30','2026-08-05 10:25:30',12),(14,'bacViceChairperson','BAC Vice-Chairperson','2026-08-06 01:21:30','2026-08-06 01:21:30',2),(15,'planningOfficer','Municipal Planning and Development Coordinator','2026-08-06 01:21:31','2026-08-06 01:21:31',14),(16,'sanggunianSecretary','Secretary to the Sangguniang Bayan','2026-08-06 01:21:31','2026-08-06 01:21:31',13);
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `securities`
--

DROP TABLE IF EXISTS `securities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `securities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` enum('bid','performance','warranty') COLLATE utf8mb4_unicode_ci NOT NULL,
  `form` enum('cash','managersCheck','bankDraftGuarantee','suretyBond','securingDeclaration') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'suretyBond',
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `percentage` decimal(6,3) DEFAULT NULL,
  `referenceNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `issuer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `postedAt` datetime NOT NULL,
  `validUntil` date DEFAULT NULL,
  `status` enum('posted','released','forfeited') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'posted',
  `releasedAt` datetime DEFAULT NULL,
  `forfeitedAt` datetime DEFAULT NULL,
  `forfeitureReason` text COLLATE utf8mb4_unicode_ci,
  `entityRef` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityId` int NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `vendorId` int DEFAULT NULL,
  `recordedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `securities_entity_ref_entity_id` (`entityRef`,`entityId`),
  KEY `securities_type_status` (`type`,`status`),
  KEY `vendorId` (`vendorId`),
  KEY `recordedById` (`recordedById`),
  CONSTRAINT `securities_ibfk_1` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `securities_ibfk_2` FOREIGN KEY (`recordedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `securities_ibfk_3` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `securities_ibfk_4` FOREIGN KEY (`recordedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=46 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `securities`
--

LOCK TABLES `securities` WRITE;
/*!40000 ALTER TABLE `securities` DISABLE KEYS */;
INSERT INTO `securities` VALUES (31,'bid','suretyBond',142500.00,0.050,'BS-2026-9-1','Pioneer Insurance & Surety Corporation','2026-03-23 08:30:00','2026-03-24','posted',NULL,NULL,NULL,'bid',25,'2026-08-06 01:27:01','2026-08-06 01:27:01',7,5),(32,'bid','cash',57000.00,0.020,'BS-2026-9-2','Cash deposit','2026-03-23 08:30:00','2026-03-24','released','2026-04-16 01:30:00',NULL,NULL,'bid',26,'2026-08-06 01:27:01','2026-08-06 01:27:01',8,5),(33,'bid','cash',57000.00,0.020,'BS-2026-9-3','Cash deposit','2026-03-23 08:30:00','2026-03-24','released','2026-04-16 01:30:00',NULL,NULL,'bid',27,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,5),(34,'performance','cash',135175.00,0.050,'PS-2026-0001','Land Bank of the Philippines','2026-04-28 06:20:00','2026-06-30','posted',NULL,NULL,NULL,'contract',7,'2026-08-06 01:27:01','2026-08-06 01:27:01',7,5),(35,'bid','suretyBond',420000.00,0.050,'BS-2026-10-1','Pioneer Insurance & Surety Corporation','2026-03-24 08:30:00','2026-03-25','posted',NULL,NULL,NULL,'bid',28,'2026-08-06 01:27:01','2026-08-06 01:27:01',8,5),(36,'bid','cash',168000.00,0.020,'BS-2026-10-2','Cash deposit','2026-03-24 08:30:00','2026-03-25','released','2026-04-17 01:30:00',NULL,NULL,'bid',29,'2026-08-06 01:27:01','2026-08-06 01:27:01',7,5),(37,'bid','cash',168000.00,0.020,'BS-2026-10-3','Cash deposit','2026-03-24 08:30:00','2026-03-25','released','2026-04-17 01:30:00',NULL,NULL,'bid',30,'2026-08-06 01:27:01','2026-08-06 01:27:01',9,5),(38,'performance','suretyBond',2438100.00,0.300,'PS-2026-0002','Pioneer Insurance & Surety Corporation','2026-04-29 06:20:00','2026-07-01','posted',NULL,NULL,NULL,'contract',8,'2026-08-06 01:27:02','2026-08-06 01:27:02',8,5),(39,'bid','suretyBond',210000.00,0.050,'BS-2026-11-1','Pioneer Insurance & Surety Corporation','2026-03-25 08:30:00','2026-03-26','posted',NULL,NULL,NULL,'bid',31,'2026-08-06 01:27:02','2026-08-06 01:27:02',8,5),(40,'bid','cash',84000.00,0.020,'BS-2026-11-2','Cash deposit','2026-03-25 08:30:00','2026-03-26','released','2026-04-18 01:30:00',NULL,NULL,'bid',32,'2026-08-06 01:27:02','2026-08-06 01:27:02',7,5),(41,'bid','cash',84000.00,0.020,'BS-2026-11-3','Cash deposit','2026-03-25 08:30:00','2026-03-26','released','2026-04-18 01:30:00',NULL,NULL,'bid',33,'2026-08-06 01:27:02','2026-08-06 01:27:02',9,5),(42,'performance','suretyBond',1225500.00,0.300,'PS-2026-0003','Pioneer Insurance & Surety Corporation','2026-04-30 06:20:00','2026-07-02','posted',NULL,NULL,NULL,'contract',9,'2026-08-06 01:27:02','2026-08-06 01:27:02',8,5),(43,'bid','suretyBond',97500.00,0.050,'BS-2026-12-1','Pioneer Insurance & Surety Corporation','2026-08-03 07:00:00','2026-08-18','posted',NULL,NULL,NULL,'bid',34,'2026-08-06 01:27:02','2026-08-06 01:27:02',9,5),(44,'bid','cash',39000.00,0.020,'BS-2026-12-2','Cash deposit','2026-08-03 07:00:00','2026-08-18','posted',NULL,NULL,NULL,'bid',35,'2026-08-06 01:27:02','2026-08-06 01:27:02',7,5),(45,'bid','cash',39000.00,0.020,'BS-2026-12-3','Cash deposit','2026-08-03 07:00:00','2026-08-18','posted',NULL,NULL,NULL,'bid',36,'2026-08-06 01:27:02','2026-08-06 01:27:02',8,5);
/*!40000 ALTER TABLE `securities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `systemsettings`
--

DROP TABLE IF EXISTS `systemsettings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `systemsettings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key` (`key`),
  UNIQUE KEY `key_2` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `systemsettings`
--

LOCK TABLES `systemsettings` WRITE;
/*!40000 ALTER TABLE `systemsettings` DISABLE KEYS */;
INSERT INTO `systemsettings` VALUES (1,'lgu.name','Municipality of Roxas, Oriental Mindoro','Name of the local government unit','2026-08-05 10:25:25','2026-08-05 10:25:25'),(2,'lgu.type','municipality','province | city | municipality | barangay — drives IRR Sec. 34.2 thresholds','2026-08-05 10:25:25','2026-08-05 10:25:25'),(3,'lgu.incomeClass','2nd','1st–5th income class — drives IRR Sec. 34.2 thresholds','2026-08-05 10:25:25','2026-08-05 10:25:25'),(4,'accounting.capitalizationThreshold','50000','Peso threshold at or above which a long-lived item is Capital Outlay; below it, semi-expendable (COA Circular 2022-004)','2026-08-06 01:21:30','2026-08-06 01:21:30');
/*!40000 ALTER TABLE `systemsettings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pendingActivation','active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `activatedAt` datetime DEFAULT NULL,
  `passwordChangedAt` datetime DEFAULT NULL,
  `themePreference` enum('system','light','dark') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'light',
  `sidebarCollapsed` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `roleId` int DEFAULT NULL,
  `departmentId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `email_2` (`email`),
  KEY `roleId` (`roleId`),
  KEY `departmentId` (`departmentId`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `users_ibfk_2` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `users_ibfk_3` FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `users_ibfk_4` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Joel R. Fabricante','systemadministrator@civicbid.test','$2b$12$cFHxJyELt3GaeOwg9/QjT.8aokiw6avH4xh4PGau4TaYuIgRxcQNm','active',NULL,NULL,'light',0,'2026-08-05 10:25:26','2026-08-05 10:25:32',1,11),(2,'Hon. Teresita M. Alcantara','hope@civicbid.test','$2b$12$FuejW9e6GE./iPRM2aAR4.SohL1THbLAEDvabVTuQNodLCaCz3XTW','active',NULL,NULL,'light',0,'2026-08-05 10:25:26','2026-08-05 10:25:32',2,1),(3,'Atty. Rodel V. Manalo','bacchairperson@civicbid.test','$2b$12$E2ASzGN9D7x1MmGaXp85lOv.JtVPDHl7sc82CcszVvDFwYVFl5Ic.','active',NULL,NULL,'light',0,'2026-08-05 10:25:26','2026-08-05 10:25:32',3,2),(4,'Engr. Cristina P. Bautista','bacmember@civicbid.test','$2b$12$ag6h.4PQ2rtoNDZWMM34n.gsJCQ0lFXFbDOpuIjQxUJSQf3rxH9A2','active',NULL,NULL,'light',0,'2026-08-05 10:25:27','2026-08-05 10:25:32',4,2),(5,'Marilou D. Ceniza','bacsecretariat@civicbid.test','$2b$12$igsAfgd3vwJDmckJG5MZSu6fuDQ.BMuWIHMVMW0exzzFAPbs33zcq','active',NULL,NULL,'light',0,'2026-08-05 10:25:27','2026-08-05 10:25:32',5,3),(6,'Engr. Noel A. Villamor','twgmember@civicbid.test','$2b$12$rT9Xi1jgEKkrUH3EWq0i0ev7/nhAJztb0J.gCUQoNziDr5aGih5lO','active',NULL,NULL,'light',0,'2026-08-05 10:25:27','2026-08-05 10:25:32',6,4),(7,'Dr. Anna Liza R. Cortez','departmentrequester@civicbid.test','$2b$12$b0U22DHp0xELF2y3Q6jzZucJjzahLyC1x1NWXaLMvJRk5v2d07Y4.','active',NULL,NULL,'light',0,'2026-08-05 10:25:27','2026-08-05 10:25:32',7,9),(8,'Elena S. Villaflor','budgetofficer@civicbid.test','$2b$12$N9dJFQyv7cdeeFIAf1uT0u2lDFLnRQmN4.yEYqR/mmwJ1dTKCxPTm','active',NULL,NULL,'light',0,'2026-08-05 10:25:28','2026-08-05 10:25:32',8,5),(9,'Ramon T. Delos Reyes','municipalaccountant@civicbid.test','$2b$12$MaNQZUW7o8KvO2MseR3U6OoDiukRQvAxm7lYnbkWPIsexteZDte3i','active',NULL,NULL,'light',0,'2026-08-05 10:25:28','2026-08-05 10:25:32',9,6),(10,'Lorna F. Aguinaldo','municipaltreasurer@civicbid.test','$2b$12$wSozDV6iZmrvdODi1tyyBOsjUD8FLcUSQ/5/ORWfuKfBJIz89qDjK','active',NULL,NULL,'light',0,'2026-08-05 10:25:29','2026-08-05 10:25:32',10,7),(11,'Medline Diagnostics Trading Corporation','vendor@civicbid.test','$2b$12$1LuMpr487OVzB.Dnh55epe.NJuwICD0PN4ldpkEuiFA.FO2/Ov46K','active',NULL,NULL,'light',0,'2026-08-05 10:25:29','2026-08-05 10:25:32',11,NULL),(12,'Fr. Antonio L. Perez','observer@civicbid.test','$2b$12$AawDlw1wBY5n.9SZ/hDjsud2.doP/QmFD6nJmux0TeWAciB7hmqtm','active',NULL,NULL,'light',0,'2026-08-05 10:25:30','2026-08-05 10:25:32',12,NULL),(13,'Grace B. Mendoza','internalauditor@civicbid.test','$2b$12$Mla30LSK33an5rEUFVNezOu8zHQ7LPPHRGClTsepAJsRq9kfNEmtO','active',NULL,NULL,'light',0,'2026-08-05 10:25:30','2026-08-05 10:25:32',13,12),(14,'BAC Vice-Chairperson','bacvicechairperson@civicbid.test','$2b$12$DL4HmK8ldE9Amb0kVD/NoeJmP3WJAkTortJH9Ht9mF7oDbVlig0z.','active',NULL,NULL,'light',0,'2026-08-06 01:21:30','2026-08-06 01:21:30',14,2),(15,'Municipal Planning and Development Coordinator','planningofficer@civicbid.test','$2b$12$c5AP9cMILcP6tpor/8V3K.4f.OMtS64B6o9fCjNPAXOAiEsAWozF6','active',NULL,NULL,'light',0,'2026-08-06 01:21:31','2026-08-06 01:21:31',15,14),(16,'Secretary to the Sangguniang Bayan','sangguniansecretary@civicbid.test','$2b$12$PirCRXAHMWR260g7EJDBV.M1XT4NKnCBWmJ0Q7btUFfV9eUQTn1k2','active',NULL,NULL,'light',0,'2026-08-06 01:21:31','2026-08-06 01:21:31',16,13);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vendordocuments`
--

DROP TABLE IF EXISTS `vendordocuments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vendordocuments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `docType` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `citation` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fileRef` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiryDate` date DEFAULT NULL,
  `status` enum('attached','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'attached',
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `vendorId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `vendorId` (`vendorId`),
  CONSTRAINT `vendordocuments_ibfk_1` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `vendordocuments_ibfk_2` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vendordocuments`
--

LOCK TABLES `vendordocuments` WRITE;
/*!40000 ALTER TABLE `vendordocuments` DISABLE KEYS */;
/*!40000 ALTER TABLE `vendordocuments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vendors`
--

DROP TABLE IF EXISTS `vendors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vendors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `businessName` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tin` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `organizationType` enum('corporation','partnership','soleProprietorship','cooperative') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'corporation',
  `isJointVenture` tinyint(1) NOT NULL DEFAULT '0',
  `isForeignBidder` tinyint(1) NOT NULL DEFAULT '0',
  `philgepsRegistrationNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `philgepsExpiry` date DEFAULT NULL,
  `isVatRegistered` tinyint(1) NOT NULL DEFAULT '1',
  `taxClassification` enum('goods','services') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'goods',
  `contactEmail` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contactPerson` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contactPhone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referenceCode` varchar(24) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registrationStatus` enum('draft','submitted','verified','returned','blacklisted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `reviewRemarks` text COLLATE utf8mb4_unicode_ci,
  `submittedAt` datetime DEFAULT NULL,
  `reviewedAt` datetime DEFAULT NULL,
  `receivedAt` datetime DEFAULT NULL,
  `accountCreatedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `userId` int DEFAULT NULL,
  `reviewedByUserId` int DEFAULT NULL,
  `recordedByUserId` int DEFAULT NULL,
  `announcementId` int DEFAULT NULL,
  `blacklistedAt` datetime DEFAULT NULL,
  `blacklistedUntil` datetime DEFAULT NULL,
  `blacklistGrounds` text COLLATE utf8mb4_unicode_ci,
  `blacklistOrderNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `statusBeforeBlacklist` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `referenceCode` (`referenceCode`),
  UNIQUE KEY `referenceCode_2` (`referenceCode`),
  KEY `userId` (`userId`),
  KEY `reviewedByUserId` (`reviewedByUserId`),
  KEY `recordedByUserId` (`recordedByUserId`),
  KEY `announcementId` (`announcementId`),
  CONSTRAINT `vendors_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vendors_ibfk_2` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vendors_ibfk_3` FOREIGN KEY (`recordedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vendors_ibfk_4` FOREIGN KEY (`announcementId`) REFERENCES `announcements` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vendors_ibfk_5` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vendors_ibfk_6` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vendors_ibfk_7` FOREIGN KEY (`recordedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vendors_ibfk_8` FOREIGN KEY (`announcementId`) REFERENCES `announcements` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vendors`
--

LOCK TABLES `vendors` WRITE;
/*!40000 ALTER TABLE `vendors` DISABLE KEYS */;
INSERT INTO `vendors` VALUES (7,'Medline Diagnostics Trading Corporation','008-421-773-000','corporation',0,0,'PG-2021-004118','2026-12-31',1,'goods','bids@medline-diagnostics.example',NULL,'+63 43 288 4410','142 Roxas Boulevard, Calapan City, Oriental Mindoro',NULL,'verified',NULL,NULL,NULL,NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',11,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(8,'Sierra Verde Construction and Supply, Inc.','221-908-455-000','corporation',0,0,'PG-2020-009823','2026-12-31',1,'services','office@sierraverde.example',NULL,'+63 43 286 1177','Km. 12 National Highway, Roxas, Oriental Mindoro',NULL,'verified',NULL,NULL,NULL,NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(9,'Pinnacle Office Systems Enterprises','410-556-201-000','soleProprietorship',0,0,'PG-2022-001904','2026-12-31',0,'goods','sales@pinnacleoffice.example',NULL,'+63 917 442 8890','Unit 5, Mabini Commercial Center, Roxas, Oriental Mindoro',NULL,'verified',NULL,NULL,NULL,NULL,NULL,'2026-08-06 01:27:01','2026-08-06 01:27:01',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `vendors` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-06 10:08:06
