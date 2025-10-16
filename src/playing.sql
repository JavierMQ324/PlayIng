-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 10-10-2025 a las 03:52:38
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `playing`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `canciones`
--

CREATE TABLE `canciones` (
  `id_cancion` int(11) NOT NULL,
  `spotify_id` varchar(100) NOT NULL,
  `titulo` varchar(250) NOT NULL,
  `artista` varchar(200) NOT NULL,
  `album` varchar(250) DEFAULT NULL,
  `duracion` int(11) NOT NULL,
  `creada_en` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cola_cancion`
--

CREATE TABLE `cola_cancion` (
  `id` int(11) NOT NULL,
  `cancion_id` int(11) NOT NULL,
  `anadido_por` int(11) NOT NULL,
  `posicion` int(11) NOT NULL,
  `status` enum('pending','playing','skipped','played') DEFAULT 'pending',
  `creada_en` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `mesas`
--

CREATE TABLE `mesas` (
  `id_mesa` int(11) NOT NULL,
  `numero_mesa` varchar(20) NOT NULL,
  `qr_code` varchar(200) NOT NULL,
  `status` enum('libre','ocupada') DEFAULT 'libre',
  `creado_en` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ordenes`
--

CREATE TABLE `ordenes` (
  `id_orden` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `mesa_id` int(11) NOT NULL,
  `status` enum('pendiente','en_preparacion','entregada','pagada') DEFAULT 'pendiente',
  `total_monto` decimal(10,2) DEFAULT 0.00,
  `tiempo_estimado` int(11) DEFAULT NULL,
  `creada_en` datetime DEFAULT current_timestamp(),
  `actualizado_en` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id_user` int(11) NOT NULL,
  `google_id` varchar(250) DEFAULT NULL,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `roll` enum('cliente','admin') DEFAULT 'cliente',
  `mesa_id_activa` int(11) DEFAULT NULL,
  `creada_en` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `votos`
--

CREATE TABLE `votos` (
  `id_voto` int(11) NOT NULL,
  `cola_cancion_id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `type` enum('skip','like','dislike') NOT NULL,
  `creada_en` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `canciones`
--
ALTER TABLE `canciones`
  ADD PRIMARY KEY (`id_cancion`),
  ADD UNIQUE KEY `spotify_id` (`spotify_id`);

--
-- Indices de la tabla `cola_cancion`
--
ALTER TABLE `cola_cancion`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cancion_id` (`cancion_id`),
  ADD KEY `anadido_por` (`anadido_por`);

--
-- Indices de la tabla `mesas`
--
ALTER TABLE `mesas`
  ADD PRIMARY KEY (`id_mesa`),
  ADD UNIQUE KEY `numero_mesa` (`numero_mesa`),
  ADD UNIQUE KEY `qr_code` (`qr_code`);

--
-- Indices de la tabla `ordenes`
--
ALTER TABLE `ordenes`
  ADD PRIMARY KEY (`id_orden`),
  ADD KEY `usuario_id` (`usuario_id`),
  ADD KEY `mesa_id` (`mesa_id`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id_user`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `google_id` (`google_id`),
  ADD KEY `mesa_id_activa` (`mesa_id_activa`);

--
-- Indices de la tabla `votos`
--
ALTER TABLE `votos`
  ADD PRIMARY KEY (`id_voto`),
  ADD UNIQUE KEY `unico_vote` (`cola_cancion_id`,`usuario_id`,`type`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `canciones`
--
ALTER TABLE `canciones`
  MODIFY `id_cancion` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cola_cancion`
--
ALTER TABLE `cola_cancion`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `mesas`
--
ALTER TABLE `mesas`
  MODIFY `id_mesa` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `ordenes`
--
ALTER TABLE `ordenes`
  MODIFY `id_orden` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id_user` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `votos`
--
ALTER TABLE `votos`
  MODIFY `id_voto` int(11) NOT NULL AUTO_INCREMENT;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `cola_cancion`
--
ALTER TABLE `cola_cancion`
  ADD CONSTRAINT `cola_cancion_ibfk_1` FOREIGN KEY (`cancion_id`) REFERENCES `canciones` (`id_cancion`) ON DELETE CASCADE,
  ADD CONSTRAINT `cola_cancion_ibfk_2` FOREIGN KEY (`anadido_por`) REFERENCES `usuarios` (`id_user`) ON DELETE CASCADE;

--
-- Filtros para la tabla `ordenes`
--
ALTER TABLE `ordenes`
  ADD CONSTRAINT `ordenes_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id_user`) ON DELETE CASCADE,
  ADD CONSTRAINT `ordenes_ibfk_2` FOREIGN KEY (`mesa_id`) REFERENCES `mesas` (`id_mesa`) ON DELETE CASCADE;

--
-- Filtros para la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`mesa_id_activa`) REFERENCES `mesas` (`id_mesa`) ON DELETE SET NULL;

--
-- Filtros para la tabla `votos`
--
ALTER TABLE `votos`
  ADD CONSTRAINT `votos_ibfk_1` FOREIGN KEY (`cola_cancion_id`) REFERENCES `cola_cancion` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `votos_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id_user`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
