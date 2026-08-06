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
  KEY `userId` (`userId`),
  KEY `issuedByUserId` (`issuedByUserId`),
  CONSTRAINT `activationtokens_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `activationtokens_ibfk_2` FOREIGN KEY (`issuedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
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
  CONSTRAINT `announcements_ibfk_3` FOREIGN KEY (`publishedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
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
  `status` enum('draft','pendingConsolidation','pendingBudgetCertification','pendingHopeApproval','approved','returned','locked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `planStage` enum('ppmp','indicativeApp','finalApp') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ppmp',
  `lockedAt` datetime DEFAULT NULL,
  `returnRemarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `implementingUnitId` int DEFAULT NULL,
  `appropriationId` int DEFAULT NULL,
  `createdById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `implementingUnitId` (`implementingUnitId`),
  KEY `appropriationId` (`appropriationId`),
  KEY `createdById` (`createdById`),
  KEY `app_entries_fiscal_year_status` (`fiscalYear`,`status`),
  CONSTRAINT `appentries_ibfk_1` FOREIGN KEY (`implementingUnitId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appentries_ibfk_2` FOREIGN KEY (`appropriationId`) REFERENCES `appropriations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appentries_ibfk_3` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appentries`
--

LOCK TABLES `appentries` WRITE;
/*!40000 ALTER TABLE `appentries` DISABLE KEYS */;
INSERT INTO `appentries` VALUES (1,'Supply and Delivery of Medical Equipment for the Municipal Health Office','Procurement of diagnostic and treatment equipment for the Rural Health Unit, including patient monitors, nebulisers, an ECG machine and examination furniture, to restore full service capacity at the main health station.',NULL,'PAP-HLTH-2024-011',NULL,'Goods','competitiveBidding',2850000.00,NULL,NULL,'General Fund — 20% Development Fund',NULL,'Q1','Q3',NULL,2026,'locked','finalApp','2026-01-29 03:20:00',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',10,1,7),(2,'Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','Concreting of 1.2 kilometres of farm-to-market road serving four upland barangays, including drainage canals and road shoulders, to reduce haulage cost for local produce.',NULL,'PAP-INFR-2024-004',NULL,'Infrastructure','competitiveBidding',8400000.00,NULL,NULL,'Local Development Fund',NULL,'Q1','Q2',NULL,2026,'locked','finalApp','2026-01-30 03:20:00',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',9,2,7),(3,'Construction of Barangay Malitbog Health Station','Construction of a one-storey barangay health station with consultation rooms, a birthing area, a pharmacy counter and a potable water system.',NULL,'PAP-HLTH-2024-019',NULL,'Infrastructure','competitiveBidding',4200000.00,NULL,NULL,'General Fund — 20% Development Fund',NULL,'Q2','Q4',NULL,2026,'locked','finalApp','2026-01-31 03:20:00',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',10,1,7),(4,'Supply and Delivery of Information Technology Equipment for Municipal Offices','Procurement of desktop computers, network switches and uninterruptible power supplies to replace end-of-life units across the Municipal Hall, in support of the digitalisation programme.',NULL,'PAP-ITO-2024-007',NULL,'Goods','competitiveBidding',1950000.00,NULL,NULL,'General Fund — MOOE',NULL,'Q3','Q4',NULL,2026,'locked','finalApp','2026-02-01 03:20:00',NULL,'2026-08-05 10:25:33','2026-08-05 10:25:33',11,3,7),(5,'Procurement of Two (2) Units Garbage Compactor Truck','Acquisition of two garbage compactor trucks to expand solid waste collection coverage to the remaining eight barangays under the Ecological Solid Waste Management Plan.',NULL,'PAP-GSO-2024-002',NULL,'Goods','competitiveBidding',11500000.00,NULL,NULL,'General Fund — Capital Outlay',NULL,'Q4','Q4',NULL,2026,'locked','finalApp','2026-02-02 03:20:00',NULL,'2026-08-05 10:25:33','2026-08-05 10:25:33',8,4,7),(6,'Construction of Municipal Evacuation Center','Construction of a disaster-resilient evacuation centre with a capacity of 500 persons, including sanitation facilities, a generator set and a rainwater collection system.',NULL,'PAP-INFR-2024-021',NULL,'Infrastructure','competitiveBidding',15750000.00,NULL,NULL,'Local Disaster Risk Reduction and Management Fund',NULL,'Q4','Q4',NULL,2026,'locked','finalApp','2026-02-03 03:20:00',NULL,'2026-08-05 10:25:33','2026-08-05 10:25:33',9,2,7);
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
  `type` enum('annual','supplemental','continuing') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'annual',
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
  PRIMARY KEY (`id`),
  KEY `departmentId` (`departmentId`),
  KEY `recordedById` (`recordedById`),
  KEY `appropriations_fiscal_year_status` (`fiscalYear`,`status`),
  KEY `appropriations_fund_expense_class` (`fund`,`expenseClass`),
  CONSTRAINT `appropriations_ibfk_1` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `appropriations_ibfk_2` FOREIGN KEY (`recordedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appropriations`
--

LOCK TABLES `appropriations` WRITE;
/*!40000 ALTER TABLE `appropriations` DISABLE KEYS */;
INSERT INTO `appropriations` VALUES (1,2026,'Ord. No. 2026-01','2026-01-05','annual','generalFund','capitalOutlay','PAP-HLTH-CO-01','5-02-13-990','Health Facilities and Medical Equipment Outlay',9500000.00,'enacted',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',10,8),(2,2026,'Ord. No. 2026-01','2026-01-05','annual','generalFund','capitalOutlay','PAP-INFR-CO-01','5-02-13-060','Local Roads and Public Infrastructure Outlay',32000000.00,'enacted',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',9,8),(3,2026,'Ord. No. 2026-01','2026-01-05','annual','generalFund','mooe','PAP-ITO-MOOE-04','5-02-03-010','Information Technology Equipment and Systems',3400000.00,'enacted',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',11,8),(4,2026,'Ord. No. 2026-01','2026-01-05','annual','generalFund','capitalOutlay','PAP-GSO-CO-02','5-02-13-050','General Services Motor Vehicle and Equipment Outlay',14000000.00,'enacted',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',8,8),(5,2026,'Ord. No. 2026-01','2026-01-05','annual','specialEducationFund','mooe','PAP-SEF-MOOE-01','5-02-99-990','Special Education Fund — School Health Programme',2200000.00,'enacted',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',10,8);
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
  KEY `actorId` (`actorId`),
  KEY `audit_logs_entity_ref_entity_id` (`entityRef`,`entityId`),
  KEY `audit_logs_action_type` (`actionType`),
  CONSTRAINT `auditlogs_ibfk_1` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auditlogs`
--

LOCK TABLES `auditlogs` WRITE;
/*!40000 ALTER TABLE `auditlogs` DISABLE KEYS */;
INSERT INTO `auditlogs` VALUES (1,'app.transition','appEntry',1,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Health Office.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-08 01:15:00',1,'0000000000000000000000000000000000000000000000000000000000000000','49e0811479a59ea7ddddf1ac288ab0685858c2318d877bc624323d00ee86c04e',7),(2,'app.transition','appEntry',1,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-15 02:40:00',2,'49e0811479a59ea7ddddf1ac288ab0685858c2318d877bc624323d00ee86c04e','9d9a7a8c0954c030b8da740d9c6cfe2a9ffdf493cbf52933eb1812900d378579',5),(3,'app.transition','appEntry',1,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Health Facilities and Medical Equipment Outlay. Certified in the amount of ₱2,850,000.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-22 06:05:00',3,'9d9a7a8c0954c030b8da740d9c6cfe2a9ffdf493cbf52933eb1812900d378579','ed36c594d2b453683af834ff32e2c3970cf5ba66c1ed5e7cbafc9a3f0422733d',8),(4,'app.transition','appEntry',1,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Supply and Delivery of Medical Equipment for the Municipal Health Office: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-29 03:20:00',4,'ed36c594d2b453683af834ff32e2c3970cf5ba66c1ed5e7cbafc9a3f0422733d','83c202567ca9fbedb785de5c3542287970247cf0b3e18c416457f0884aad5a6e',2),(5,'pr.transition','pr',1,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0001: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-05 00:50:00',5,'83c202567ca9fbedb785de5c3542287970247cf0b3e18c416457f0884aad5a6e','54e22f051b949bd62914765193ace4eaee6d1683e06e480607cfd39c966bfa66',7),(6,'pr.transition','pr',1,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingSecretariatReview\", \"remarks\": \"ORS-2026-0001 issued against Ord. No. 2026-01. ₱2,850,000 obligated.\"}','success','PR-2026-0001: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-11 05:30:00',6,'54e22f051b949bd62914765193ace4eaee6d1683e06e480607cfd39c966bfa66','51a3ae64049cf457ed657b47a2dad1670c9571ad041804c82d282adcfde72dd5',8),(7,'pr.transition','pr',1,'{\"status\": \"pendingSecretariatReview\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Technical specifications reviewed and found complete.\"}','success','PR-2026-0001: review','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-02-17 07:10:00',7,'51a3ae64049cf457ed657b47a2dad1670c9571ad041804c82d282adcfde72dd5','6acab29540fde9b35de48e0375d1dcacee0d043585a78419f67d2c808a41b0ee',5),(8,'pr.transition','pr',1,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved for procurement through competitive bidding.\"}','success','PR-2026-0001: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-21 02:05:00',8,'6acab29540fde9b35de48e0375d1dcacee0d043585a78419f67d2c808a41b0ee','b96a8e10f3dad64093daf30804621e24f7ee2aa772091f02676ddc3123933c95',2),(9,'rfq.published','rfq',1,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱2,850,000.\"}','success','ITB-2026-001 advertised — Supply and Delivery of Medical Equipment for the Municipal Health Office','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-03 00:00:00',9,'b96a8e10f3dad64093daf30804621e24f7ee2aa772091f02676ddc3123933c95','535379f01641452118e8d830d67e0534aa98bbde6edf56928895de0aad6e9ab1',5),(10,'bids.opened','rfq',1,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-001','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-24 06:30:00',10,'535379f01641452118e8d830d67e0534aa98bbde6edf56928895de0aad6e9ab1','0b4ad176ac4bdea9a190b9e53361aa00e3ba0f8b08392a6dc5942e0a717024d1',3),(11,'evaluation.submitted','bid',1,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-001','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-02 07:45:00',11,'0b4ad176ac4bdea9a190b9e53361aa00e3ba0f8b08392a6dc5942e0a717024d1','c1f5329d17658ce099f53387514af492f989ee18c78dae331548dafcd7650de0',4),(12,'evaluation.closed','rfq',1,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-001','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-02 07:45:00',12,'c1f5329d17658ce099f53387514af492f989ee18c78dae331548dafcd7650de0','b88d585c712b94863d109969cefd331bd81e98a7123f397efa5db14b335f724e',3),(13,'award.recommended','award',1,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱2,703,500, ₱146,500 below the approved budget.\"}','success','BAC-RES-2026-0001 — award recommended to Medline Diagnostics Trading Corporation','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-09 03:00:00',13,'b88d585c712b94863d109969cefd331bd81e98a7123f397efa5db14b335f724e','4151f4f7ad2718b7836d3dccbf17c2526ff85f88578e5ad8750e450b1a5f2bc8',3),(14,'award.approved','award',1,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱2,703,500.\"}','success','NOA-2026-0001 issued to Medline Diagnostics Trading Corporation','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-16 01:30:00',14,'4151f4f7ad2718b7836d3dccbf17c2526ff85f88578e5ad8750e450b1a5f2bc8','dfc308b38c9114a9ee90dc45d0d2cc861fcc7d44049266fab466cdf9fc3414de',2),(15,'contract.signed','contract',1,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱2,703,500. Delivery due 2026-06-30.\"}','success','CON-2026-0001 signed with Medline Diagnostics Trading Corporation','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-28 06:20:00',15,'dfc308b38c9114a9ee90dc45d0d2cc861fcc7d44049266fab466cdf9fc3414de','1ef0bb1ddb5e9d8e13ba772d67fabf4f88f114d3b51b88c3cc7d70c82b4f356b',3),(16,'delivery.inspected','contract',1,NULL,'{\"status\": \"accepted\", \"remarks\": \"Inspected by the General Services Office and accepted in full. No deductions applied.\"}','success','Delivery inspected and accepted under CON-2026-0001','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-06-16 05:40:00',16,'1ef0bb1ddb5e9d8e13ba772d67fabf4f88f114d3b51b88c3cc7d70c82b4f356b','df09e7a3d33074045baaf2cd3630a378f2ac84de29dec89d6ce02cf062fe54f8',5),(17,'invoice.certified','invoice',1,NULL,'{\"status\": \"certified\", \"remarks\": \"Supporting documents complete. Certified for disbursement.\"}','success','INV-2026-0001 certified for payment','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-07-01 03:25:00',17,'df09e7a3d33074045baaf2cd3630a378f2ac84de29dec89d6ce02cf062fe54f8','7c3db7ee97e8693e07c73317cbfb2ecd2ad1504fd1cbbd81f79311b947ccb4aa',9),(18,'payment.released','payment',1,NULL,'{\"ewt\": 24138.39, \"gross\": 2703500, \"status\": \"released\", \"remarks\": \"Gross ₱2,703,500 less ₱144,830.35 in deductions — net ₱2,558,669.65 released by cheque LBP-480000.\", \"retention\": 0, \"netReleased\": 2558669.65, \"vatWithheld\": 120691.96}','success','DV-2026-0001 released to Medline Diagnostics Trading Corporation','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-07-09 06:50:00',18,'7c3db7ee97e8693e07c73317cbfb2ecd2ad1504fd1cbbd81f79311b947ccb4aa','df4f25e3e3fe87ec10bb3cfe3a6f2754e52ec75ab781b12983da0dd5ece31bf9',10),(19,'app.transition','appEntry',2,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Engineering Office.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-09 01:15:00',19,'df4f25e3e3fe87ec10bb3cfe3a6f2754e52ec75ab781b12983da0dd5ece31bf9','a98aa10e2bbdbd1b96c1c9a51ac7cbe46669dfcdce5c337c03303efefcc37f74',7),(20,'app.transition','appEntry',2,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-16 02:40:00',20,'a98aa10e2bbdbd1b96c1c9a51ac7cbe46669dfcdce5c337c03303efefcc37f74','a3a8af94d4d5ccd6cd1750cd01d1e7003229d08911c58f7300181416deb06df1',5),(21,'app.transition','appEntry',2,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Local Roads and Public Infrastructure Outlay. Certified in the amount of ₱8,400,000.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-23 06:05:00',21,'a3a8af94d4d5ccd6cd1750cd01d1e7003229d08911c58f7300181416deb06df1','100aeddc75cb2260f1d4d2eb8b48d15999532493eca0cb215300f41783615d3a',8),(22,'app.transition','appEntry',2,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1): approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-30 03:20:00',22,'100aeddc75cb2260f1d4d2eb8b48d15999532493eca0cb215300f41783615d3a','ceb21d528293198de9dc8270375443063d9208bb3b04d6abd40476c969fa0b5e',2),(23,'pr.transition','pr',2,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0002: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-06 00:50:00',23,'ceb21d528293198de9dc8270375443063d9208bb3b04d6abd40476c969fa0b5e','2d34d0413d26b6e71c9f60f2f2214741cb84381b43722770915811ab4a2fb6d5',7),(24,'pr.transition','pr',2,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingSecretariatReview\", \"remarks\": \"ORS-2026-0002 issued against Ord. No. 2026-01. ₱8,400,000 obligated.\"}','success','PR-2026-0002: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-12 05:30:00',24,'2d34d0413d26b6e71c9f60f2f2214741cb84381b43722770915811ab4a2fb6d5','74cfb9dc5e1d14a65d2750608eca3dc988383316a8d181821c70ee359d468ad2',8),(25,'pr.transition','pr',2,'{\"status\": \"pendingSecretariatReview\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Technical specifications reviewed and found complete.\"}','success','PR-2026-0002: review','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-02-18 07:10:00',25,'74cfb9dc5e1d14a65d2750608eca3dc988383316a8d181821c70ee359d468ad2','c23504b7cf9f498131cfd54a3e31ba74d9cb17331bcb5aaeb20b3dbf2a972a9f',5),(26,'pr.transition','pr',2,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved for procurement through competitive bidding.\"}','success','PR-2026-0002: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-22 02:05:00',26,'c23504b7cf9f498131cfd54a3e31ba74d9cb17331bcb5aaeb20b3dbf2a972a9f','ff36459e7f68b70b5494eaa4c3bce2451390c965f09a8699d16659c623dd39fe',2),(27,'rfq.published','rfq',2,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱8,400,000.\"}','success','ITB-2026-002 advertised — Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-04 00:00:00',27,'ff36459e7f68b70b5494eaa4c3bce2451390c965f09a8699d16659c623dd39fe','fc6dbf4e1438b9acdfa7d89b746039c66d92849912f1c5ac18ab7fe94e960501',5),(28,'bids.opened','rfq',2,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-002','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-25 06:30:00',28,'fc6dbf4e1438b9acdfa7d89b746039c66d92849912f1c5ac18ab7fe94e960501','35876f263339595fc86619f950401d2390401ddf5a01c619370c8ef69d8e5a57',3),(29,'evaluation.submitted','bid',4,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-002','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-03 07:45:00',29,'35876f263339595fc86619f950401d2390401ddf5a01c619370c8ef69d8e5a57','9fd9e81307ff024a6f9893e43855a2a417fb3ff722420c6333e191018471e9f9',4),(30,'evaluation.closed','rfq',2,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-002','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-03 07:45:00',30,'9fd9e81307ff024a6f9893e43855a2a417fb3ff722420c6333e191018471e9f9','72902d4efba4fd4595f49e963b1958bdfa3d30c2ebaa0289cb4873b2f492474f',3),(31,'award.recommended','award',2,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱8,127,000, ₱273,000 below the approved budget.\"}','success','BAC-RES-2026-0002 — award recommended to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-10 03:00:00',31,'72902d4efba4fd4595f49e963b1958bdfa3d30c2ebaa0289cb4873b2f492474f','0897bffc556a4461783bef76ed3b0f1f3602ca71e563935cdc3cb36c5b11deb1',3),(32,'award.approved','award',2,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱8,127,000.\"}','success','NOA-2026-0002 issued to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-17 01:30:00',32,'0897bffc556a4461783bef76ed3b0f1f3602ca71e563935cdc3cb36c5b11deb1','0b9fa16c9c74439f79ef0a6b9357c50ef1071161202f516d5d715e9526dfa8f4',2),(33,'contract.signed','contract',2,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱8,127,000. Delivery due 2026-07-01.\"}','success','CON-2026-0002 signed with Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-29 06:20:00',33,'0b9fa16c9c74439f79ef0a6b9357c50ef1071161202f516d5d715e9526dfa8f4','3bec2d5841c47008027bed7a00e80e7f5132797da4ef66013e16424cfbe4777d',3),(34,'delivery.inspected','contract',2,NULL,'{\"status\": \"accepted\", \"remarks\": \"Inspected by the General Services Office and accepted in full. No deductions applied.\"}','success','Delivery inspected and accepted under CON-2026-0002','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-06-17 05:40:00',34,'3bec2d5841c47008027bed7a00e80e7f5132797da4ef66013e16424cfbe4777d','cca1ae47c07e9466df749e2bdd1555427906b9f9a13c847042dee1bb2e4471a0',5),(35,'invoice.certified','invoice',2,NULL,'{\"status\": \"certified\", \"remarks\": \"Supporting documents complete. Certified for disbursement.\"}','success','INV-2026-0002 certified for payment','127.0.0.1','Ramon T. Delos Reyes','municipalAccountant','2026-07-02 03:25:00',35,'cca1ae47c07e9466df749e2bdd1555427906b9f9a13c847042dee1bb2e4471a0','af7d60e82092f30214e3e27129d6a14c54de915b08c7b1decb5ad5a1b8589ba8',9),(36,'payment.released','payment',2,NULL,'{\"ewt\": 145125, \"gross\": 8127000, \"status\": \"released\", \"remarks\": \"Gross ₱8,127,000 less ₱1,320,637.5 in deductions — net ₱6,806,362.5 released by cheque LBP-480001.\", \"retention\": 812700, \"netReleased\": 6806362.5, \"vatWithheld\": 362812.5}','success','DV-2026-0002 released to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Lorna F. Aguinaldo','municipalTreasurer','2026-07-10 06:50:00',36,'af7d60e82092f30214e3e27129d6a14c54de915b08c7b1decb5ad5a1b8589ba8','e0301569505130c90b80f3d5e7cb3b57f9492ad58e78e69ba4ec334ba979e539',10),(37,'app.transition','appEntry',3,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Health Office.\"}','success','Construction of Barangay Malitbog Health Station: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-10 01:15:00',37,'e0301569505130c90b80f3d5e7cb3b57f9492ad58e78e69ba4ec334ba979e539','05e31acf3b4ca970955b0be4a967b04adf7f53679dc07b7faec77ddc2f61072c',7),(38,'app.transition','appEntry',3,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Construction of Barangay Malitbog Health Station: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-17 02:40:00',38,'05e31acf3b4ca970955b0be4a967b04adf7f53679dc07b7faec77ddc2f61072c','ce508c1464666a1c37b5cd30bcabbe4d1eb72ebb4daa29ee484164172ef53deb',5),(39,'app.transition','appEntry',3,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Health Facilities and Medical Equipment Outlay. Certified in the amount of ₱4,200,000.\"}','success','Construction of Barangay Malitbog Health Station: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-24 06:05:00',39,'ce508c1464666a1c37b5cd30bcabbe4d1eb72ebb4daa29ee484164172ef53deb','d1463a909cb5e4ea0a0b6448ceb2524aa730319c7ebaaaa5a3cc6b45396d2a4e',8),(40,'app.transition','appEntry',3,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Construction of Barangay Malitbog Health Station: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-01-31 03:20:00',40,'d1463a909cb5e4ea0a0b6448ceb2524aa730319c7ebaaaa5a3cc6b45396d2a4e','98d3d25dc479c4bb89a3b1820e906e3c64762afad8fc50c5568f5df1eb538ed9',2),(41,'pr.transition','pr',3,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0003: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-07 00:50:00',41,'98d3d25dc479c4bb89a3b1820e906e3c64762afad8fc50c5568f5df1eb538ed9','cf15b579fb38170431dc1515708f3d94a2450935faf6c3d85e5b4cf8025fff9f',7),(42,'pr.transition','pr',3,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingSecretariatReview\", \"remarks\": \"ORS-2026-0003 issued against Ord. No. 2026-01. ₱4,200,000 obligated.\"}','success','PR-2026-0003: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-13 05:30:00',42,'cf15b579fb38170431dc1515708f3d94a2450935faf6c3d85e5b4cf8025fff9f','f8887493bc3db2f014eb4d6bdcd143491e09f8c86c8ca12c6a510a57d763aaaa',8),(43,'pr.transition','pr',3,'{\"status\": \"pendingSecretariatReview\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Technical specifications reviewed and found complete.\"}','success','PR-2026-0003: review','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-02-19 07:10:00',43,'f8887493bc3db2f014eb4d6bdcd143491e09f8c86c8ca12c6a510a57d763aaaa','84572ca81be5ed756b3130a6d28dda8c8b76e2e85513f30f19977381d19f45b2',5),(44,'pr.transition','pr',3,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved for procurement through competitive bidding.\"}','success','PR-2026-0003: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-23 02:05:00',44,'84572ca81be5ed756b3130a6d28dda8c8b76e2e85513f30f19977381d19f45b2','ff92fd010b375a9bdcc80efa75dd91f30925cbd2ccc37512817c9b6442452f87',2),(45,'rfq.published','rfq',3,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱4,200,000.\"}','success','ITB-2026-003 advertised — Construction of Barangay Malitbog Health Station','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-03-05 00:00:00',45,'ff92fd010b375a9bdcc80efa75dd91f30925cbd2ccc37512817c9b6442452f87','2e2b4c56db4aa34b7acd81a6541c79ea3df690a5c6a719cf054a800503e37794',5),(46,'bids.opened','rfq',3,NULL,'{\"status\": \"opened\", \"remarks\": \"Opened in public session, witnessed by a COA representative and two civil society observers.\"}','success','3 bids opened for ITB-2026-003','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-03-26 06:30:00',46,'2e2b4c56db4aa34b7acd81a6541c79ea3df690a5c6a719cf054a800503e37794','0f713db4acab678256052c67b5503d66f2a16eb456a83c85f0397dd0cf87982f',3),(47,'evaluation.submitted','bid',7,NULL,'{\"status\": \"evaluated\"}','success','Technical evaluation submitted for ITB-2026-003','127.0.0.1','Engr. Cristina P. Bautista','bacMember','2026-04-04 07:45:00',47,'0f713db4acab678256052c67b5503d66f2a16eb456a83c85f0397dd0cf87982f','8ef36ef576562b9392e691dec9c2cc8c4593cdad4c9efb5abf372e8a6d71b1ac',4),(48,'evaluation.closed','rfq',3,NULL,'{\"status\": \"evaluated\", \"remarks\": \"Lowest calculated responsive bid identified and referred for post-qualification under IRR Sec. 60.\"}','success','Evaluation concluded for ITB-2026-003','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-04 07:45:00',48,'8ef36ef576562b9392e691dec9c2cc8c4593cdad4c9efb5abf372e8a6d71b1ac','a4476cca2d130f07d5a24a2639481680495da8939f0fe8757e420fa2e61c1fdc',3),(49,'award.recommended','award',3,NULL,'{\"status\": \"pendingHopeApproval\", \"remarks\": \"Post-qualification passed. Recommended at ₱4,085,000, ₱115,000 below the approved budget.\"}','success','BAC-RES-2026-0003 — award recommended to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-11 03:00:00',49,'a4476cca2d130f07d5a24a2639481680495da8939f0fe8757e420fa2e61c1fdc','b57f0b480d8ed7eeeb302599b8843b5d7251e827eba37033b6013c3f51be7d77',3),(50,'award.approved','award',3,NULL,'{\"status\": \"issued\", \"remarks\": \"Notice of Award approved and issued in the amount of ₱4,085,000.\"}','success','NOA-2026-0003 issued to Sierra Verde Construction and Supply, Inc.','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-04-18 01:30:00',50,'b57f0b480d8ed7eeeb302599b8843b5d7251e827eba37033b6013c3f51be7d77','9e4f5c2fd08e661b4df4a8b636dbf16bb1b2dd7a9aee80c3831ebf3f1e8bec60',2),(51,'contract.signed','contract',3,NULL,'{\"status\": \"active\", \"remarks\": \"Contract executed at ₱4,085,000. Delivery due 2026-07-02.\"}','success','CON-2026-0003 signed with Sierra Verde Construction and Supply, Inc.','127.0.0.1','Atty. Rodel V. Manalo','bacChairperson','2026-04-30 06:20:00',51,'9e4f5c2fd08e661b4df4a8b636dbf16bb1b2dd7a9aee80c3831ebf3f1e8bec60','71157592e149f199e7b454157f2c9d3b6d771c2474d6bed0141fccb0de7f468d',3),(52,'app.transition','appEntry',4,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Information Technology Office.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-11 01:15:00',52,'71157592e149f199e7b454157f2c9d3b6d771c2474d6bed0141fccb0de7f468d','57340d92bd867abf553a883981fd829abcea4db530cc3ddd3703323ec1b37b0a',7),(53,'app.transition','appEntry',4,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-18 02:40:00',53,'57340d92bd867abf553a883981fd829abcea4db530cc3ddd3703323ec1b37b0a','55bde64a7cedd579f78c52c991f28eba1e54b6f71bcce5af37d82dd927ade4f0',5),(54,'app.transition','appEntry',4,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Information Technology Equipment and Systems. Certified in the amount of ₱1,950,000.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-25 06:05:00',54,'55bde64a7cedd579f78c52c991f28eba1e54b6f71bcce5af37d82dd927ade4f0','24a93108b9437f8ffc9003f3c0d8c418fc8d669af1137c470f7fbab9705fa1d8',8),(55,'app.transition','appEntry',4,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Supply and Delivery of Information Technology Equipment for Municipal Offices: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-01 03:20:00',55,'24a93108b9437f8ffc9003f3c0d8c418fc8d669af1137c470f7fbab9705fa1d8','453664382a44cc69dcd8daa827dd589342cd0e9f40864cd70d54357d690535e4',2),(56,'pr.transition','pr',4,'{\"status\": \"draft\"}','{\"status\": \"pendingDepartmentHeadEndorsement\", \"remarks\": \"Requisition raised against the approved APP entry.\"}','success','PR-2026-0004: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-02-08 00:50:00',56,'453664382a44cc69dcd8daa827dd589342cd0e9f40864cd70d54357d690535e4','068bdbc350ed4a95ccf27a07751fb4f3fd5480e8a083cf1adbb4b05d4bec69d4',7),(57,'pr.transition','pr',4,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingSecretariatReview\", \"remarks\": \"ORS-2026-0004 issued against Ord. No. 2026-01. ₱1,950,000 obligated.\"}','success','PR-2026-0004: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-02-14 05:30:00',57,'068bdbc350ed4a95ccf27a07751fb4f3fd5480e8a083cf1adbb4b05d4bec69d4','cbedf1c42f5591ea3c287bca4ec2a3f74621a82c40167c1440d1b45a209a9888',8),(58,'pr.transition','pr',4,'{\"status\": \"pendingSecretariatReview\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Technical specifications reviewed and found complete.\"}','success','PR-2026-0004: review','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-02-20 07:10:00',58,'cbedf1c42f5591ea3c287bca4ec2a3f74621a82c40167c1440d1b45a209a9888','69358b0073a6a7315360caf94ed386f99b18087046e2970d67404859042e036d',5),(59,'pr.transition','pr',4,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved for procurement through competitive bidding.\"}','success','PR-2026-0004: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-24 02:05:00',59,'69358b0073a6a7315360caf94ed386f99b18087046e2970d67404859042e036d','0ff931d53314727c3bee6add346c6a075f5abca32db334fe21c7be836b15b75e',2),(60,'rfq.published','rfq',4,NULL,'{\"status\": \"published\", \"remarks\": \"Posted on the PhilGEPS portal and the municipal bulletin board. ABC ₱1,950,000.\"}','success','ITB-2026-004 advertised — Supply and Delivery of Information Technology Equipment for Municipal Offices','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-07-27 00:00:00',60,'0ff931d53314727c3bee6add346c6a075f5abca32db334fe21c7be836b15b75e','1127f048b94bfa0806044874812fbcd932fc85a6639f4e19210b9c528486ce3a',5),(61,'app.transition','appEntry',5,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the General Services Office (GSO).\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-12 01:15:00',61,'1127f048b94bfa0806044874812fbcd932fc85a6639f4e19210b9c528486ce3a','7afc93fbcba3a4c9f5e5a9784b3b2260912b134f5ef7615638625ab2a3202daa',7),(62,'app.transition','appEntry',5,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-19 02:40:00',62,'7afc93fbcba3a4c9f5e5a9784b3b2260912b134f5ef7615638625ab2a3202daa','fb38ebdb8b766dd4f72a4e293a801c8407a0b412176b65421ce70e5f6b0f54fb',5),(63,'app.transition','appEntry',5,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — General Services Motor Vehicle and Equipment Outlay. Certified in the amount of ₱11,500,000.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-26 06:05:00',63,'fb38ebdb8b766dd4f72a4e293a801c8407a0b412176b65421ce70e5f6b0f54fb','e33a100e9f2d9f15473f1720db5376c76a76db38f896631c5b248eecccf17a3c',8),(64,'app.transition','appEntry',5,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Procurement of Two (2) Units Garbage Compactor Truck: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-02 03:20:00',64,'e33a100e9f2d9f15473f1720db5376c76a76db38f896631c5b248eecccf17a3c','931c007acbeb654204777f9d7dce96d37215c3ab13055233dc41e6418720a9b6',2),(65,'app.transition','appEntry',6,'{\"status\": \"draft\"}','{\"status\": \"pendingConsolidation\", \"remarks\": \"Included in the 2026 Annual Procurement Plan for the Municipal Engineering Office.\"}','success','Construction of Municipal Evacuation Center: submit','127.0.0.1','Dr. Anna Liza R. Cortez','departmentRequester','2026-01-13 01:15:00',65,'931c007acbeb654204777f9d7dce96d37215c3ab13055233dc41e6418720a9b6','6806f5a5a653c7ec6e4f15fb914b80e6ee29c371c40b82e6e58fb319d3c1892f',7),(66,'app.transition','appEntry',6,'{\"status\": \"pendingConsolidation\"}','{\"status\": \"pendingBudgetCertification\", \"remarks\": \"Consolidated into the indicative APP and forwarded for funding certification.\"}','success','Construction of Municipal Evacuation Center: consolidate','127.0.0.1','Marilou D. Ceniza','bacSecretariat','2026-01-20 02:40:00',66,'6806f5a5a653c7ec6e4f15fb914b80e6ee29c371c40b82e6e58fb319d3c1892f','630fc189187499721afd7272567665ce8329755c1c0015f757bca60d25b29af6',5),(67,'app.transition','appEntry',6,'{\"status\": \"pendingBudgetCertification\"}','{\"status\": \"pendingHopeApproval\", \"remarks\": \"Funds available under Ord. No. 2026-01 — Local Roads and Public Infrastructure Outlay. Certified in the amount of ₱15,750,000.\"}','success','Construction of Municipal Evacuation Center: certify','127.0.0.1','Elena S. Villaflor','budgetOfficer','2026-01-27 06:05:00',67,'630fc189187499721afd7272567665ce8329755c1c0015f757bca60d25b29af6','31938a80b72a7c3cac3f7e3da47e1f8955fd5391e5216d08d15ca195118eb8fa',8),(68,'app.transition','appEntry',6,'{\"status\": \"pendingHopeApproval\"}','{\"status\": \"approved\", \"remarks\": \"Approved. The entry is locked and may now be requisitioned against.\"}','success','Construction of Municipal Evacuation Center: approve','127.0.0.1','Hon. Teresita M. Alcantara','hope','2026-02-03 03:20:00',68,'31938a80b72a7c3cac3f7e3da47e1f8955fd5391e5216d08d15ca195118eb8fa','02a0ea85a9f1027e4a8a8decc173a4ea7d387d75273931fc0b0c1e894f2ee459',2),(69,'auth.login.success','auth',7,NULL,NULL,'success','Dr. Anna Liza R. Cortez signed in','::1','Dr. Anna Liza R. Cortez','departmentRequester','2026-08-05 22:52:52',69,'02a0ea85a9f1027e4a8a8decc173a4ea7d387d75273931fc0b0c1e894f2ee459','f2947e548cc512000acdb1ff2f32079924b229e6d83e18484bcf4249f31f830c',7);
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
  `status` enum('pendingHopeApproval','issued','accepted','declined','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendingHopeApproval',
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `rfqId` int DEFAULT NULL,
  `bidId` int DEFAULT NULL,
  `vendorId` int DEFAULT NULL,
  `recommendedById` int DEFAULT NULL,
  `approvedById` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `noaNumber` (`noaNumber`),
  KEY `rfqId` (`rfqId`),
  KEY `bidId` (`bidId`),
  KEY `vendorId` (`vendorId`),
  KEY `recommendedById` (`recommendedById`),
  KEY `approvedById` (`approvedById`),
  CONSTRAINT `awards_ibfk_1` FOREIGN KEY (`rfqId`) REFERENCES `rfqs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_2` FOREIGN KEY (`bidId`) REFERENCES `bids` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_3` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_4` FOREIGN KEY (`recommendedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `awards_ibfk_5` FOREIGN KEY (`approvedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `awards`
--

LOCK TABLES `awards` WRITE;
/*!40000 ALTER TABLE `awards` DISABLE KEYS */;
INSERT INTO `awards` VALUES (1,'NOA-2026-0001','2026-04-16',2703500.00,'accepted',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,1,1,3,2),(2,'NOA-2026-0002','2026-04-17',8127000.00,'accepted',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,4,2,3,2),(3,'NOA-2026-0003','2026-04-18',4085000.00,'accepted',NULL,'2026-08-05 10:25:33','2026-08-05 10:25:33',3,7,2,3,2);
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
  KEY `chairpersonId` (`chairpersonId`),
  KEY `bac_resolutions_entity_ref_entity_id` (`entityRef`,`entityId`),
  KEY `bac_resolutions_type` (`type`),
  CONSTRAINT `bacresolutions_ibfk_1` FOREIGN KEY (`chairpersonId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bacresolutions`
--

LOCK TABLES `bacresolutions` WRITE;
/*!40000 ALTER TABLE `bacresolutions` DISABLE KEYS */;
INSERT INTO `bacresolutions` VALUES (1,'BAC-RES-2026-0001','recommendAward','Resolution recommending award of ITB-2026-001 to Medline Diagnostics Trading Corporation','Three (3) bids were received and opened in public session. The bid of Medline Diagnostics Trading Corporation at ₱2,703,500 was determined to be the Lowest Calculated Responsive Bid and passed post-qualification under IRR Sec. 60.','2026-04-09 03:00:00','[{\"name\": \"Atty. Rodel V. Manalo\", \"role\": \"bacChairperson\", \"userId\": 3, \"concurred\": true}, {\"name\": \"Engr. Cristina P. Bautista\", \"role\": \"bacMember\", \"userId\": 4, \"concurred\": true}, {\"name\": \"Engr. Noel A. Villamor\", \"role\": \"twgMember\", \"userId\": 6, \"concurred\": true}]',1,'award',1,'2026-08-05 10:25:32','2026-08-05 10:25:32',3),(2,'BAC-RES-2026-0002','recommendAward','Resolution recommending award of ITB-2026-002 to Sierra Verde Construction and Supply, Inc.','Three (3) bids were received and opened in public session. The bid of Sierra Verde Construction and Supply, Inc. at ₱8,127,000 was determined to be the Lowest Calculated Responsive Bid and passed post-qualification under IRR Sec. 60.','2026-04-10 03:00:00','[{\"name\": \"Atty. Rodel V. Manalo\", \"role\": \"bacChairperson\", \"userId\": 3, \"concurred\": true}, {\"name\": \"Engr. Cristina P. Bautista\", \"role\": \"bacMember\", \"userId\": 4, \"concurred\": true}, {\"name\": \"Engr. Noel A. Villamor\", \"role\": \"twgMember\", \"userId\": 6, \"concurred\": true}]',1,'award',2,'2026-08-05 10:25:32','2026-08-05 10:25:32',3),(3,'BAC-RES-2026-0003','recommendAward','Resolution recommending award of ITB-2026-003 to Sierra Verde Construction and Supply, Inc.','Three (3) bids were received and opened in public session. The bid of Sierra Verde Construction and Supply, Inc. at ₱4,085,000 was determined to be the Lowest Calculated Responsive Bid and passed post-qualification under IRR Sec. 60.','2026-04-11 03:00:00','[{\"name\": \"Atty. Rodel V. Manalo\", \"role\": \"bacChairperson\", \"userId\": 3, \"concurred\": true}, {\"name\": \"Engr. Cristina P. Bautista\", \"role\": \"bacMember\", \"userId\": 4, \"concurred\": true}, {\"name\": \"Engr. Noel A. Villamor\", \"role\": \"twgMember\", \"userId\": 6, \"concurred\": true}]',1,'award',3,'2026-08-05 10:25:33','2026-08-05 10:25:33',3);
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
  CONSTRAINT `bidopeningrecords_ibfk_2` FOREIGN KEY (`openedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bidopeningrecords`
--

LOCK TABLES `bidopeningrecords` WRITE;
/*!40000 ALTER TABLE `bidopeningrecords` DISABLE KEYS */;
INSERT INTO `bidopeningrecords` VALUES (1,'2026-03-24 06:30:00','COA representative, two (2) observers from accredited civil society organisations','All envelopes received intact and opened in public session.',3,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,3),(2,'2026-03-25 06:30:00','COA representative, two (2) observers from accredited civil society organisations','All envelopes received intact and opened in public session.',3,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,3),(3,'2026-03-26 06:30:00','COA representative, two (2) observers from accredited civil society organisations','All envelopes received intact and opened in public session.',3,'2026-08-05 10:25:32','2026-08-05 10:25:32',3,3);
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
  CONSTRAINT `bids_ibfk_2` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bids`
--

LOCK TABLES `bids` WRITE;
/*!40000 ALTER TABLE `bids` DISABLE KEYS */;
INSERT INTO `bids` VALUES (1,1,0,2703500.00,'2026-03-23 08:30:00','Bidder A','postQualified',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,1),(2,1,0,2752163.00,'2026-03-23 08:30:00','Bidder B','lost',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,2),(3,1,0,2800826.00,'2026-03-23 08:30:00','Bidder C','lost',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,3),(4,1,0,8127000.00,'2026-03-24 08:30:00','Bidder A','postQualified',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,2),(5,1,0,8273286.00,'2026-03-24 08:30:00','Bidder B','lost',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,1),(6,1,0,8419572.00,'2026-03-24 08:30:00','Bidder C','lost',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,3),(7,1,0,4085000.00,'2026-03-25 08:30:00','Bidder A','postQualified',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',3,2),(8,1,0,4158530.00,'2026-03-25 08:30:00','Bidder B','lost',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',3,1),(9,1,0,4232060.00,'2026-03-25 08:30:00','Bidder C','lost',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',3,3),(10,1,1,NULL,'2026-08-02 07:00:00',NULL,'submitted',NULL,'2026-08-05 10:25:33','2026-08-05 10:25:33',4,3),(11,1,1,NULL,'2026-08-02 07:00:00',NULL,'submitted',NULL,'2026-08-05 10:25:33','2026-08-05 10:25:33',4,1),(12,1,1,NULL,'2026-08-02 07:00:00',NULL,'submitted',NULL,'2026-08-05 10:25:33','2026-08-05 10:25:33',4,2);
/*!40000 ALTER TABLE `bids` ENABLE KEYS */;
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
  CONSTRAINT `conferenceattendances_ibfk_2` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `contractNo` (`contractNo`),
  KEY `awardId` (`awardId`),
  KEY `vendorId` (`vendorId`),
  KEY `draftedById` (`draftedById`),
  CONSTRAINT `contracts_ibfk_1` FOREIGN KEY (`awardId`) REFERENCES `awards` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `contracts_ibfk_2` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `contracts_ibfk_3` FOREIGN KEY (`draftedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contracts`
--

LOCK TABLES `contracts` WRITE;
/*!40000 ALTER TABLE `contracts` DISABLE KEYS */;
INSERT INTO `contracts` VALUES (1,'CON-2026-0001',NULL,2703500.00,2703500.00,'purchaseOrder','goods','2026-05-02','2026-06-30','2026-05-02 01:00:00',60,0,NULL,'2026-06-16 05:40:00','Payment upon delivery, inspection and acceptance, subject to the usual government deductions.','completed','2026-04-28 06:20:00','2026-04-28 06:20:00',0.00,NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,1,5),(2,'CON-2026-0002',NULL,8127000.00,8127000.00,'contract','infrastructure','2026-05-03','2026-07-01','2026-05-03 01:00:00',120,0,NULL,'2026-06-17 05:40:00','Payment upon delivery, inspection and acceptance, subject to the usual government deductions.','completed','2026-04-29 06:20:00','2026-04-29 06:20:00',812700.00,NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,2,5),(3,'CON-2026-0003',NULL,4085000.00,0.00,'contract','infrastructure','2026-05-04','2026-07-02','2026-05-04 01:00:00',120,0,NULL,NULL,'Payment upon delivery, inspection and acceptance, subject to the usual government deductions.','active','2026-04-30 06:20:00','2026-04-30 06:20:00',0.00,NULL,'2026-08-05 10:25:33','2026-08-05 10:25:33',3,2,5);
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
  CONSTRAINT `deliveries_ibfk_3` FOREIGN KEY (`inspectedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `deliveries`
--

LOCK TABLES `deliveries` WRITE;
/*!40000 ALTER TABLE `deliveries` DISABLE KEYS */;
INSERT INTO `deliveries` VALUES (1,'2026-06-12 02:15:00','2026-06-16 05:40:00','Full delivery received and inspected.','accepted','Delivered in full, conforming to specification.',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,7,5),(2,'2026-06-13 02:15:00','2026-06-17 05:40:00','Full delivery received and inspected.','accepted','Delivered in full, conforming to specification.',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,7,5),(3,'2026-06-14 02:15:00',NULL,'Partial delivery received; inspection pending.','underInspection',NULL,NULL,'2026-08-05 10:25:33','2026-08-05 10:25:33',3,7,NULL);
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
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `departments`
--

LOCK TABLES `departments` WRITE;
/*!40000 ALTER TABLE `departments` DISABLE KEYS */;
INSERT INTO `departments` VALUES (1,'Office of the Mayor','OMAYOR','executive','active',NULL,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(2,'Bids and Awards Committee','BAC','committee','active',NULL,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(3,'BAC Secretariat','BACSEC','committee','active',NULL,'2026-08-05 10:25:25','2026-08-05 10:25:25'),(4,'Technical Working Group','TWG','committee','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(5,'Municipal Budget Office','BUDGET','support','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(6,'Municipal Accounting Office','ACCTG','support','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(7,'Municipal Treasurer\'s Office','TREAS','support','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(8,'General Services Office (GSO)','GSO','endUser','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(9,'Municipal Engineering Office','ENGR','endUser','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(10,'Municipal Health Office','HEALTH','endUser','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(11,'Information Technology Office','IT','endUser','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26'),(12,'Internal Audit Service','INTAUDIT','support','active',NULL,'2026-08-05 10:25:26','2026-08-05 10:25:26');
/*!40000 ALTER TABLE `departments` ENABLE KEYS */;
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
  KEY `uploadedById` (`uploadedById`),
  KEY `documents_entity_ref_entity_id` (`entityRef`,`entityId`),
  CONSTRAINT `documents_ibfk_1` FOREIGN KEY (`uploadedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
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
  CONSTRAINT `evaluations_ibfk_2` FOREIGN KEY (`evaluatorId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
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
  KEY `contractId` (`contractId`),
  KEY `deliveryId` (`deliveryId`),
  KEY `vendorId` (`vendorId`),
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`contractId`) REFERENCES `contracts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `invoices_ibfk_2` FOREIGN KEY (`deliveryId`) REFERENCES `deliveries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `invoices_ibfk_3` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoices`
--

LOCK TABLES `invoices` WRITE;
/*!40000 ALTER TABLE `invoices` DISABLE KEYS */;
INSERT INTO `invoices` VALUES (1,'INV-2026-0001','SI-1200',2703500.00,'2026-06-20 01:05:00','paid',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,1,1),(2,'INV-2026-0002','SI-1201',8127000.00,'2026-06-21 01:05:00','paid',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,2,2);
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
  CONSTRAINT `liveconferencesessions_ibfk_2` FOREIGN KEY (`scheduledById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
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
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`recipientId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
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
  KEY `appropriationId` (`appropriationId`),
  KEY `certifiedById` (`certifiedById`),
  KEY `prHeaderId` (`prHeaderId`),
  KEY `obligations_status` (`status`),
  CONSTRAINT `obligations_ibfk_1` FOREIGN KEY (`appropriationId`) REFERENCES `appropriations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `obligations_ibfk_2` FOREIGN KEY (`certifiedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `obligations_ibfk_3` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `obligations`
--

LOCK TABLES `obligations` WRITE;
/*!40000 ALTER TABLE `obligations` DISABLE KEYS */;
INSERT INTO `obligations` VALUES (1,'ORS-2026-0001',2850000.00,'obligated','2026-02-11 05:30:00',NULL,NULL,'Supply and Delivery of Medical Equipment for the Municipal Health Office','2026-08-05 10:25:32','2026-08-05 10:25:32',1,8,1),(2,'ORS-2026-0002',8400000.00,'obligated','2026-02-12 05:30:00',NULL,NULL,'Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','2026-08-05 10:25:32','2026-08-05 10:25:32',2,8,2),(3,'ORS-2026-0003',4200000.00,'obligated','2026-02-13 05:30:00',NULL,NULL,'Construction of Barangay Malitbog Health Station','2026-08-05 10:25:32','2026-08-05 10:25:32',1,8,3),(4,'ORS-2026-0004',1950000.00,'obligated','2026-02-14 05:30:00',NULL,NULL,'Supply and Delivery of Information Technology Equipment for Municipal Offices','2026-08-05 10:25:33','2026-08-05 10:25:33',3,8,4);
/*!40000 ALTER TABLE `obligations` ENABLE KEYS */;
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
  KEY `otp_challenges_reference` (`reference`),
  KEY `otp_challenges_user_id_purpose` (`userId`,`purpose`),
  CONSTRAINT `otpchallenges_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
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
  KEY `invoiceId` (`invoiceId`),
  KEY `preparedById` (`preparedById`),
  KEY `releasedById` (`releasedById`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`preparedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_3` FOREIGN KEY (`releasedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
INSERT INTO `payments` VALUES (1,'DV-2026-0001',2703500.00,24138.39,120691.96,0.00,0.00,0.00,'{\"lines\": [{\"base\": 2413839.29, \"rate\": 0.01, \"label\": \"Expanded withholding tax (1% on goods)\", \"amount\": 24138.39}, {\"base\": 2413839.29, \"rate\": 0.05, \"label\": \"Final VAT withheld on government purchase (5%)\", \"amount\": 120691.96}], \"vatComponent\": 289660.71, \"vatRegistered\": true, \"vatExclusiveBase\": 2413839.29, \"taxClassification\": \"goods\"}',2558669.65,'2026-07-01 03:25:00','2026-07-09 06:50:00','released','Check','LBP-480000',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,9,10),(2,'DV-2026-0002',8127000.00,145125.00,362812.50,812700.00,0.00,0.00,'{\"lines\": [{\"base\": 7256250, \"rate\": 0.02, \"label\": \"Expanded withholding tax (2% on services)\", \"amount\": 145125}, {\"base\": 7256250, \"rate\": 0.05, \"label\": \"Final VAT withheld on government purchase (5%)\", \"amount\": 362812.5}, {\"base\": 8127000, \"rate\": 0.1, \"label\": \"Retention money (10% — released after final acceptance)\", \"amount\": 812700}], \"vatComponent\": 870750, \"vatRegistered\": true, \"vatExclusiveBase\": 7256250, \"taxClassification\": \"services\"}',6806362.50,'2026-07-02 03:25:00','2026-07-10 06:50:00','released','Check','LBP-480001',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,9,10);
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
  CONSTRAINT `pendingitems_ibfk_3` FOREIGN KEY (`flaggedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
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
  UNIQUE KEY `key` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES (1,'users.manage','administration','Create, edit, and deactivate user accounts','2026-08-05 10:25:25','2026-08-05 10:25:25'),(2,'bidders.createAccount','administration','Create and invite bidder accounts for registrations the BAC has approved','2026-08-05 10:25:25','2026-08-05 10:25:25'),(3,'departments.manage','administration','Create and edit departments','2026-08-05 10:25:25','2026-08-05 10:25:25'),(4,'settings.manage','administration','Change system configuration','2026-08-05 10:25:25','2026-08-05 10:25:25'),(5,'announcements.manage','administration','Write, publish, and withdraw public announcements','2026-08-05 10:25:25','2026-08-05 10:25:25'),(6,'app.view','app','View APP entries','2026-08-05 10:25:25','2026-08-05 10:25:25'),(7,'app.viewPublished','app','View approved/published APP entries only','2026-08-05 10:25:25','2026-08-05 10:25:25'),(8,'app.create','app','Create and edit own APP entries','2026-08-05 10:25:25','2026-08-05 10:25:25'),(9,'app.submit','app','Submit APP entries for consolidation','2026-08-05 10:25:25','2026-08-05 10:25:25'),(10,'app.consolidate','app','Consolidate departmental APP entries','2026-08-05 10:25:25','2026-08-05 10:25:25'),(11,'app.certify','app','Certify funding on APP entries','2026-08-05 10:25:25','2026-08-05 10:25:25'),(12,'app.approve','app','Approve or return the APP','2026-08-05 10:25:25','2026-08-05 10:25:25'),(13,'pr.view','pr','View purchase requisitions','2026-08-05 10:25:25','2026-08-05 10:25:25'),(14,'pr.create','pr','Create and submit purchase requisitions','2026-08-05 10:25:25','2026-08-05 10:25:25'),(15,'pr.endorse','pr','Endorse requisitions as department head','2026-08-05 10:25:25','2026-08-05 10:25:25'),(16,'pr.certify','pr','Certify existence of appropriation on requisitions','2026-08-05 10:25:25','2026-08-05 10:25:25'),(17,'pr.certifyCash','pr','Certify availability of funds in the treasury (LGC Sec. 344)','2026-08-05 10:25:25','2026-08-05 10:25:25'),(18,'pr.review','pr','Review requisitions as Secretariat','2026-08-05 10:25:25','2026-08-05 10:25:25'),(19,'pr.approve','pr','Give final approval on requisitions','2026-08-05 10:25:25','2026-08-05 10:25:25'),(20,'bidding.view','bidding','View bidding records','2026-08-05 10:25:25','2026-08-05 10:25:25'),(21,'bidding.viewPublished','bidding','View approved bidding records only','2026-08-05 10:25:25','2026-08-05 10:25:25'),(22,'bidding.publish','bidding','Publish RFQ/ITB and open bids','2026-08-05 10:25:25','2026-08-05 10:25:25'),(23,'bidding.submitBid','bidding','Submit a bid or quotation','2026-08-05 10:25:25','2026-08-05 10:25:25'),(24,'bidding.evaluate','bidding','Score bids against the rubric','2026-08-05 10:25:25','2026-08-05 10:25:25'),(25,'bidding.technicalInput','bidding','Provide TWG technical evaluation input','2026-08-05 10:25:25','2026-08-05 10:25:25'),(26,'bidding.chairEvaluation','bidding','Chair evaluation and resolve award','2026-08-05 10:25:25','2026-08-05 10:25:25'),(27,'bidding.approveAlternativeMode','bidding','Approve alternative procurement modes','2026-08-05 10:25:25','2026-08-05 10:25:25'),(28,'bidding.award','bidding','Approve and issue the award','2026-08-05 10:25:25','2026-08-05 10:25:25'),(29,'contract.view','contract','View contracts','2026-08-05 10:25:25','2026-08-05 10:25:25'),(30,'contract.viewPublished','contract','View approved contracts only','2026-08-05 10:25:25','2026-08-05 10:25:25'),(31,'contract.draft','contract','Draft contracts and purchase orders','2026-08-05 10:25:25','2026-08-05 10:25:25'),(32,'contract.sign','contract','Sign contracts','2026-08-05 10:25:25','2026-08-05 10:25:25'),(33,'delivery.report','delivery','Submit delivery and acceptance reports','2026-08-05 10:25:25','2026-08-05 10:25:25'),(34,'delivery.submitInvoice','delivery','Submit invoices as a supplier','2026-08-05 10:25:25','2026-08-05 10:25:25'),(35,'payment.view','delivery','View invoices and disbursement vouchers','2026-08-05 10:25:25','2026-08-05 10:25:25'),(36,'payment.certify','delivery','Certify invoices and prepare disbursement vouchers','2026-08-05 10:25:25','2026-08-05 10:25:25'),(37,'payment.release','delivery','Release disbursements from the treasury','2026-08-05 10:25:25','2026-08-05 10:25:25'),(38,'budget.view','budget','View budget and certification status','2026-08-05 10:25:25','2026-08-05 10:25:25'),(39,'budget.certify','budget','Certify availability of funds','2026-08-05 10:25:25','2026-08-05 10:25:25'),(40,'budget.manageAppropriations','budget','Record and amend appropriation ordinance lines','2026-08-05 10:25:25','2026-08-05 10:25:25'),(41,'audit.viewLogs','audit','View system logs','2026-08-05 10:25:25','2026-08-05 10:25:25'),(42,'audit.viewAll','audit','View full workflow history across modules','2026-08-05 10:25:25','2026-08-05 10:25:25'),(43,'audit.viewPublished','audit','View published transparency records only','2026-08-05 10:25:25','2026-08-05 10:25:25'),(44,'audit.export','audit','Export audit records','2026-08-05 10:25:25','2026-08-05 10:25:25');
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
  CONSTRAINT `postqualifications_ibfk_2` FOREIGN KEY (`verifiedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
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
  `status` enum('draft','pendingDepartmentHeadEndorsement','pendingBudgetCertification','pendingTreasuryCertification','pendingSecretariatReview','pendingHopeApproval','returned','approved') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `prNumber` (`prNumber`),
  KEY `appEntryId` (`appEntryId`),
  KEY `requesterId` (`requesterId`),
  KEY `departmentId` (`departmentId`),
  KEY `cashCertifiedById` (`cashCertifiedById`),
  KEY `pr_headers_status` (`status`),
  CONSTRAINT `prheaders_ibfk_1` FOREIGN KEY (`appEntryId`) REFERENCES `appentries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_2` FOREIGN KEY (`requesterId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_3` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `prheaders_ibfk_4` FOREIGN KEY (`cashCertifiedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prheaders`
--

LOCK TABLES `prheaders` WRITE;
/*!40000 ALTER TABLE `prheaders` DISABLE KEYS */;
INSERT INTO `prheaders` VALUES (1,'PR-2026-0001','Supply and Delivery of Medical Equipment for the Municipal Health Office','2026-05-01',0,NULL,2850000.00,'approved',NULL,'2026-02-11 05:30:00',NULL,'2026-02-05 00:50:00','2026-08-05 10:25:32','2026-08-05 10:25:32',1,7,10,NULL),(2,'PR-2026-0002','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','2026-05-02',0,NULL,8400000.00,'approved',NULL,'2026-02-12 05:30:00',NULL,'2026-02-06 00:50:00','2026-08-05 10:25:32','2026-08-05 10:25:32',2,7,9,NULL),(3,'PR-2026-0003','Construction of Barangay Malitbog Health Station','2026-05-03',0,NULL,4200000.00,'approved',NULL,'2026-02-13 05:30:00',NULL,'2026-02-07 00:50:00','2026-08-05 10:25:32','2026-08-05 10:25:32',3,7,10,NULL),(4,'PR-2026-0004','Supply and Delivery of Information Technology Equipment for Municipal Offices','2026-05-04',0,NULL,1950000.00,'approved',NULL,'2026-02-14 05:30:00',NULL,'2026-02-08 00:50:00','2026-08-05 10:25:33','2026-08-05 10:25:33',4,7,11,NULL);
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
  PRIMARY KEY (`id`),
  KEY `prHeaderId` (`prHeaderId`),
  CONSTRAINT `prlineitems_ibfk_1` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prlineitems`
--

LOCK TABLES `prlineitems` WRITE;
/*!40000 ALTER TABLE `prlineitems` DISABLE KEYS */;
INSERT INTO `prlineitems` VALUES (1,'Supply and Delivery of Medical Equipment for the Municipal Health Office','lot',1.00,2850000.00,2850000.00,'2026-08-05 10:25:32','2026-08-05 10:25:32',1),(2,'Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)','lot',1.00,8400000.00,8400000.00,'2026-08-05 10:25:32','2026-08-05 10:25:32',2),(3,'Construction of Barangay Malitbog Health Station','lot',1.00,4200000.00,4200000.00,'2026-08-05 10:25:32','2026-08-05 10:25:32',3),(4,'Supply and Delivery of Information Technology Equipment for Municipal Offices','lot',1.00,1950000.00,1950000.00,'2026-08-05 10:25:33','2026-08-05 10:25:33',4);
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
  UNIQUE KEY `key` (`key`)
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `referenceNo` (`referenceNo`),
  KEY `prHeaderId` (`prHeaderId`),
  KEY `procurementModeId` (`procurementModeId`),
  KEY `publishedById` (`publishedById`),
  CONSTRAINT `rfqs_ibfk_1` FOREIGN KEY (`prHeaderId`) REFERENCES `prheaders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rfqs_ibfk_2` FOREIGN KEY (`procurementModeId`) REFERENCES `procurementmodes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rfqs_ibfk_3` FOREIGN KEY (`publishedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rfqs`
--

LOCK TABLES `rfqs` WRITE;
/*!40000 ALTER TABLE `rfqs` DISABLE KEYS */;
INSERT INTO `rfqs` VALUES (1,'ITB-2026-001','Supply and Delivery of Medical Equipment for the Municipal Health Office',2850000.00,'goods','2026-03-03','2026-03-24 06:00:00',0,NULL,1,'awarded',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,1,5),(2,'ITB-2026-002','Concreting of Barangay San Vicente Farm-to-Market Road (Phase 1)',8400000.00,'infrastructure','2026-03-04','2026-03-25 06:00:00',1,'2026-03-12 02:00:00',1,'awarded',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,1,5),(3,'ITB-2026-003','Construction of Barangay Malitbog Health Station',4200000.00,'infrastructure','2026-03-05','2026-03-26 06:00:00',1,'2026-03-13 02:00:00',1,'awarded',NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',3,1,5),(4,'ITB-2026-004','Supply and Delivery of Information Technology Equipment for Municipal Offices',1950000.00,'goods','2026-07-27','2026-08-17 06:00:00',0,NULL,1,'published',NULL,'2026-08-05 10:25:33','2026-08-05 10:25:33',4,1,5);
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
INSERT INTO `rolepermissions` VALUES ('2026-08-05 10:25:26','2026-08-05 10:25:26',1,1),('2026-08-05 10:25:26','2026-08-05 10:25:26',1,2),('2026-08-05 10:25:26','2026-08-05 10:25:26',1,3),('2026-08-05 10:25:26','2026-08-05 10:25:26',1,4),('2026-08-05 10:25:26','2026-08-05 10:25:26',1,5),('2026-08-05 10:25:26','2026-08-05 10:25:26',1,41),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,6),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,12),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,13),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,19),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,20),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,27),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,28),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,38),('2026-08-05 10:25:26','2026-08-05 10:25:26',2,42),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,6),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,13),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,20),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,24),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,26),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,29),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,32),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,38),('2026-08-05 10:25:26','2026-08-05 10:25:26',3,42),('2026-08-05 10:25:26','2026-08-05 10:25:26',4,6),('2026-08-05 10:25:26','2026-08-05 10:25:26',4,13),('2026-08-05 10:25:26','2026-08-05 10:25:26',4,20),('2026-08-05 10:25:26','2026-08-05 10:25:26',4,24),('2026-08-05 10:25:26','2026-08-05 10:25:26',4,38),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,5),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,6),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,10),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,13),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,18),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,20),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,22),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,29),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,31),('2026-08-05 10:25:27','2026-08-05 10:25:27',5,38),('2026-08-05 10:25:27','2026-08-05 10:25:27',6,6),('2026-08-05 10:25:27','2026-08-05 10:25:27',6,13),('2026-08-05 10:25:27','2026-08-05 10:25:27',6,20),('2026-08-05 10:25:27','2026-08-05 10:25:27',6,25),('2026-08-05 10:25:27','2026-08-05 10:25:27',6,38),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,6),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,8),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,9),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,13),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,14),('2026-08-05 10:25:27','2026-08-05 10:25:27',7,33),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,6),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,11),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,13),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,16),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,38),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,39),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,40),('2026-08-05 10:25:28','2026-08-05 10:25:28',8,42),('2026-08-05 10:25:28','2026-08-05 10:25:28',9,35),('2026-08-05 10:25:28','2026-08-05 10:25:28',9,36),('2026-08-05 10:25:28','2026-08-05 10:25:28',9,38),('2026-08-05 10:25:28','2026-08-05 10:25:28',9,42),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,13),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,17),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,35),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,37),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,38),('2026-08-05 10:25:29','2026-08-05 10:25:29',10,42),('2026-08-05 10:25:29','2026-08-05 10:25:29',11,23),('2026-08-05 10:25:29','2026-08-05 10:25:29',11,32),('2026-08-05 10:25:29','2026-08-05 10:25:29',11,34),('2026-08-05 10:25:30','2026-08-05 10:25:30',12,7),('2026-08-05 10:25:30','2026-08-05 10:25:30',12,21),('2026-08-05 10:25:30','2026-08-05 10:25:30',12,30),('2026-08-05 10:25:30','2026-08-05 10:25:30',12,43),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,6),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,13),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,20),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,29),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,38),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,41),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,42),('2026-08-05 10:25:30','2026-08-05 10:25:30',13,44);
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
  KEY `defaultDepartmentId` (`defaultDepartmentId`),
  CONSTRAINT `roles_ibfk_1` FOREIGN KEY (`defaultDepartmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'systemAdministrator','System Administrator','2026-08-05 10:25:26','2026-08-05 10:25:26',11),(2,'hope','HOPE (Municipal Mayor)','2026-08-05 10:25:26','2026-08-05 10:25:26',1),(3,'bacChairperson','BAC Chairperson','2026-08-05 10:25:26','2026-08-05 10:25:26',2),(4,'bacMember','BAC Member','2026-08-05 10:25:26','2026-08-05 10:25:26',2),(5,'bacSecretariat','BAC Secretariat','2026-08-05 10:25:27','2026-08-05 10:25:27',3),(6,'twgMember','TWG Member','2026-08-05 10:25:27','2026-08-05 10:25:27',4),(7,'departmentRequester','Department Requester','2026-08-05 10:25:27','2026-08-05 10:25:27',9),(8,'budgetOfficer','Budget Officer','2026-08-05 10:25:28','2026-08-05 10:25:28',5),(9,'municipalAccountant','Municipal Accountant','2026-08-05 10:25:28','2026-08-05 10:25:28',6),(10,'municipalTreasurer','Municipal Treasurer','2026-08-05 10:25:29','2026-08-05 10:25:29',7),(11,'vendor','Vendor / Supplier','2026-08-05 10:25:29','2026-08-05 10:25:29',NULL),(12,'observer','Observer / Public Auditor','2026-08-05 10:25:30','2026-08-05 10:25:30',NULL),(13,'internalAuditor','Internal Auditor','2026-08-05 10:25:30','2026-08-05 10:25:30',12);
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
  KEY `vendorId` (`vendorId`),
  KEY `recordedById` (`recordedById`),
  KEY `securities_entity_ref_entity_id` (`entityRef`,`entityId`),
  KEY `securities_type_status` (`type`,`status`),
  CONSTRAINT `securities_ibfk_1` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `securities_ibfk_2` FOREIGN KEY (`recordedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `securities`
--

LOCK TABLES `securities` WRITE;
/*!40000 ALTER TABLE `securities` DISABLE KEYS */;
INSERT INTO `securities` VALUES (1,'bid','suretyBond',142500.00,0.050,'BS-2026-1-1','Pioneer Insurance & Surety Corporation','2026-03-23 08:30:00','2026-03-24','posted',NULL,NULL,NULL,'bid',1,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,5),(2,'bid','cash',57000.00,0.020,'BS-2026-1-2','Cash deposit','2026-03-23 08:30:00','2026-03-24','released','2026-04-16 01:30:00',NULL,NULL,'bid',2,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,5),(3,'bid','cash',57000.00,0.020,'BS-2026-1-3','Cash deposit','2026-03-23 08:30:00','2026-03-24','released','2026-04-16 01:30:00',NULL,NULL,'bid',3,'2026-08-05 10:25:32','2026-08-05 10:25:32',3,5),(4,'performance','cash',135175.00,0.050,'PS-2026-0001','Land Bank of the Philippines','2026-04-28 06:20:00','2026-06-30','posted',NULL,NULL,NULL,'contract',1,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,5),(5,'bid','suretyBond',420000.00,0.050,'BS-2026-2-1','Pioneer Insurance & Surety Corporation','2026-03-24 08:30:00','2026-03-25','posted',NULL,NULL,NULL,'bid',4,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,5),(6,'bid','cash',168000.00,0.020,'BS-2026-2-2','Cash deposit','2026-03-24 08:30:00','2026-03-25','released','2026-04-17 01:30:00',NULL,NULL,'bid',5,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,5),(7,'bid','cash',168000.00,0.020,'BS-2026-2-3','Cash deposit','2026-03-24 08:30:00','2026-03-25','released','2026-04-17 01:30:00',NULL,NULL,'bid',6,'2026-08-05 10:25:32','2026-08-05 10:25:32',3,5),(8,'performance','suretyBond',2438100.00,0.300,'PS-2026-0002','Pioneer Insurance & Surety Corporation','2026-04-29 06:20:00','2026-07-01','posted',NULL,NULL,NULL,'contract',2,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,5),(9,'bid','suretyBond',210000.00,0.050,'BS-2026-3-1','Pioneer Insurance & Surety Corporation','2026-03-25 08:30:00','2026-03-26','posted',NULL,NULL,NULL,'bid',7,'2026-08-05 10:25:32','2026-08-05 10:25:32',2,5),(10,'bid','cash',84000.00,0.020,'BS-2026-3-2','Cash deposit','2026-03-25 08:30:00','2026-03-26','released','2026-04-18 01:30:00',NULL,NULL,'bid',8,'2026-08-05 10:25:32','2026-08-05 10:25:32',1,5),(11,'bid','cash',84000.00,0.020,'BS-2026-3-3','Cash deposit','2026-03-25 08:30:00','2026-03-26','released','2026-04-18 01:30:00',NULL,NULL,'bid',9,'2026-08-05 10:25:32','2026-08-05 10:25:32',3,5),(12,'performance','suretyBond',1225500.00,0.300,'PS-2026-0003','Pioneer Insurance & Surety Corporation','2026-04-30 06:20:00','2026-07-02','posted',NULL,NULL,NULL,'contract',3,'2026-08-05 10:25:33','2026-08-05 10:25:33',2,5),(13,'bid','suretyBond',97500.00,0.050,'BS-2026-4-1','Pioneer Insurance & Surety Corporation','2026-08-02 07:00:00','2026-08-17','posted',NULL,NULL,NULL,'bid',10,'2026-08-05 10:25:33','2026-08-05 10:25:33',3,5),(14,'bid','cash',39000.00,0.020,'BS-2026-4-2','Cash deposit','2026-08-02 07:00:00','2026-08-17','posted',NULL,NULL,NULL,'bid',11,'2026-08-05 10:25:33','2026-08-05 10:25:33',1,5),(15,'bid','cash',39000.00,0.020,'BS-2026-4-3','Cash deposit','2026-08-02 07:00:00','2026-08-17','posted',NULL,NULL,NULL,'bid',12,'2026-08-05 10:25:33','2026-08-05 10:25:33',2,5);
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
  UNIQUE KEY `key` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `systemsettings`
--

LOCK TABLES `systemsettings` WRITE;
/*!40000 ALTER TABLE `systemsettings` DISABLE KEYS */;
INSERT INTO `systemsettings` VALUES (1,'lgu.name','Municipality of Roxas, Oriental Mindoro','Name of the local government unit','2026-08-05 10:25:25','2026-08-05 10:25:25'),(2,'lgu.type','municipality','province | city | municipality | barangay — drives IRR Sec. 34.2 thresholds','2026-08-05 10:25:25','2026-08-05 10:25:25'),(3,'lgu.incomeClass','2nd','1st–5th income class — drives IRR Sec. 34.2 thresholds','2026-08-05 10:25:25','2026-08-05 10:25:25');
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
  KEY `roleId` (`roleId`),
  KEY `departmentId` (`departmentId`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `users_ibfk_2` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Joel R. Fabricante','systemadministrator@civicbid.test','$2b$12$cFHxJyELt3GaeOwg9/QjT.8aokiw6avH4xh4PGau4TaYuIgRxcQNm','active',NULL,NULL,'light',0,'2026-08-05 10:25:26','2026-08-05 10:25:32',1,11),(2,'Hon. Teresita M. Alcantara','hope@civicbid.test','$2b$12$FuejW9e6GE./iPRM2aAR4.SohL1THbLAEDvabVTuQNodLCaCz3XTW','active',NULL,NULL,'light',0,'2026-08-05 10:25:26','2026-08-05 10:25:32',2,1),(3,'Atty. Rodel V. Manalo','bacchairperson@civicbid.test','$2b$12$E2ASzGN9D7x1MmGaXp85lOv.JtVPDHl7sc82CcszVvDFwYVFl5Ic.','active',NULL,NULL,'light',0,'2026-08-05 10:25:26','2026-08-05 10:25:32',3,2),(4,'Engr. Cristina P. Bautista','bacmember@civicbid.test','$2b$12$ag6h.4PQ2rtoNDZWMM34n.gsJCQ0lFXFbDOpuIjQxUJSQf3rxH9A2','active',NULL,NULL,'light',0,'2026-08-05 10:25:27','2026-08-05 10:25:32',4,2),(5,'Marilou D. Ceniza','bacsecretariat@civicbid.test','$2b$12$igsAfgd3vwJDmckJG5MZSu6fuDQ.BMuWIHMVMW0exzzFAPbs33zcq','active',NULL,NULL,'light',0,'2026-08-05 10:25:27','2026-08-05 10:25:32',5,3),(6,'Engr. Noel A. Villamor','twgmember@civicbid.test','$2b$12$rT9Xi1jgEKkrUH3EWq0i0ev7/nhAJztb0J.gCUQoNziDr5aGih5lO','active',NULL,NULL,'light',0,'2026-08-05 10:25:27','2026-08-05 10:25:32',6,4),(7,'Dr. Anna Liza R. Cortez','departmentrequester@civicbid.test','$2b$12$b0U22DHp0xELF2y3Q6jzZucJjzahLyC1x1NWXaLMvJRk5v2d07Y4.','active',NULL,NULL,'light',0,'2026-08-05 10:25:27','2026-08-05 10:25:32',7,9),(8,'Elena S. Villaflor','budgetofficer@civicbid.test','$2b$12$N9dJFQyv7cdeeFIAf1uT0u2lDFLnRQmN4.yEYqR/mmwJ1dTKCxPTm','active',NULL,NULL,'light',0,'2026-08-05 10:25:28','2026-08-05 10:25:32',8,5),(9,'Ramon T. Delos Reyes','municipalaccountant@civicbid.test','$2b$12$MaNQZUW7o8KvO2MseR3U6OoDiukRQvAxm7lYnbkWPIsexteZDte3i','active',NULL,NULL,'light',0,'2026-08-05 10:25:28','2026-08-05 10:25:32',9,6),(10,'Lorna F. Aguinaldo','municipaltreasurer@civicbid.test','$2b$12$wSozDV6iZmrvdODi1tyyBOsjUD8FLcUSQ/5/ORWfuKfBJIz89qDjK','active',NULL,NULL,'light',0,'2026-08-05 10:25:29','2026-08-05 10:25:32',10,7),(11,'Medline Diagnostics Trading Corporation','vendor@civicbid.test','$2b$12$1LuMpr487OVzB.Dnh55epe.NJuwICD0PN4ldpkEuiFA.FO2/Ov46K','active',NULL,NULL,'light',0,'2026-08-05 10:25:29','2026-08-05 10:25:32',11,NULL),(12,'Fr. Antonio L. Perez','observer@civicbid.test','$2b$12$AawDlw1wBY5n.9SZ/hDjsud2.doP/QmFD6nJmux0TeWAciB7hmqtm','active',NULL,NULL,'light',0,'2026-08-05 10:25:30','2026-08-05 10:25:32',12,NULL),(13,'Grace B. Mendoza','internalauditor@civicbid.test','$2b$12$Mla30LSK33an5rEUFVNezOu8zHQ7LPPHRGClTsepAJsRq9kfNEmtO','active',NULL,NULL,'light',0,'2026-08-05 10:25:30','2026-08-05 10:25:32',13,12);
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
  CONSTRAINT `vendordocuments_ibfk_1` FOREIGN KEY (`vendorId`) REFERENCES `vendors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `referenceCode` (`referenceCode`),
  KEY `userId` (`userId`),
  KEY `reviewedByUserId` (`reviewedByUserId`),
  KEY `recordedByUserId` (`recordedByUserId`),
  KEY `announcementId` (`announcementId`),
  CONSTRAINT `vendors_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vendors_ibfk_2` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vendors_ibfk_3` FOREIGN KEY (`recordedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `vendors_ibfk_4` FOREIGN KEY (`announcementId`) REFERENCES `announcements` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vendors`
--

LOCK TABLES `vendors` WRITE;
/*!40000 ALTER TABLE `vendors` DISABLE KEYS */;
INSERT INTO `vendors` VALUES (1,'Medline Diagnostics Trading Corporation','008-421-773-000','corporation',0,0,'PG-2021-004118','2026-12-31',1,'goods','bids@medline-diagnostics.example',NULL,'+63 43 288 4410','142 Roxas Boulevard, Calapan City, Oriental Mindoro',NULL,'verified',NULL,NULL,NULL,NULL,NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',11,NULL,NULL,NULL),(2,'Sierra Verde Construction and Supply, Inc.','221-908-455-000','corporation',0,0,'PG-2020-009823','2026-12-31',1,'services','office@sierraverde.example',NULL,'+63 43 286 1177','Km. 12 National Highway, Roxas, Oriental Mindoro',NULL,'verified',NULL,NULL,NULL,NULL,NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',NULL,NULL,NULL,NULL),(3,'Pinnacle Office Systems Enterprises','410-556-201-000','soleProprietorship',0,0,'PG-2022-001904','2026-12-31',0,'goods','sales@pinnacleoffice.example',NULL,'+63 917 442 8890','Unit 5, Mabini Commercial Center, Roxas, Oriental Mindoro',NULL,'verified',NULL,NULL,NULL,NULL,NULL,'2026-08-05 10:25:32','2026-08-05 10:25:32',NULL,NULL,NULL,NULL);
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

-- Dump completed on 2026-08-06  9:19:53
