-- Script para crear la tabla spotify_establecimiento
-- Ejecutar este script en la base de datos MySQL

CREATE TABLE `spotify_establecimiento` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `establecimiento_id` int(11) NOT NULL,
  `access_token` varchar(500) NOT NULL,
  `refresh_token` varchar(500) NOT NULL,
  `expires_at` datetime NOT NULL,
  `scope` text NOT NULL,
  `creado_en` datetime DEFAULT current_timestamp(),
  `actualizado_en` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `establecimiento_id` (`establecimiento_id`),
  CONSTRAINT `spotify_establecimiento_fk` 
    FOREIGN KEY (`establecimiento_id`) 
    REFERENCES `establecimientos` (`id_establecimiento`) 
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
