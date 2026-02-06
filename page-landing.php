<?php
/**
 * Template Name: Landing Hope
 *
 * Template de page d'accueil Hope Basketball
 * Charge le contenu HTML sans header/footer Avada
 */

// Empêcher l'accès direct
if (!defined('ABSPATH')) {
    exit;
}

// Chemin vers le fichier HTML (à ajuster selon l'emplacement final)
$html_file = get_stylesheet_directory() . '/hope-basketball-final.html';

if (file_exists($html_file)) {
    echo file_get_contents($html_file);
} else {
    // Fallback si le fichier n'existe pas
    ?>
    <!DOCTYPE html>
    <html lang="fr-CA">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Hope Basketball Québec</title>
    </head>
    <body>
        <h1>Page en construction</h1>
        <p>Le fichier hope-basketball-final.html n'a pas été trouvé.</p>
        <p>Chemin attendu: <?php echo esc_html($html_file); ?></p>
    </body>
    </html>
    <?php
}
