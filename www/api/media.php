<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

handle_api(function (): void {
    require_method('GET');

    $itemId = validate_item_id(query_string('id'));
    $kind = (string) ($_GET['kind'] ?? '');
    if ($kind !== 'image' && $kind !== 'model') {
        abort_request(400, 'Type de media invalide.');
    }

    $entry = public_item_or_404($itemId);
    $filename = $kind === 'image' ? ($entry['image_filename'] ?? null) : ($entry['model_filename'] ?? null);
    $mime = $kind === 'image' ? ($entry['image_mime'] ?? 'application/octet-stream') : ($entry['model_mime'] ?? 'application/octet-stream');

    if (!is_string($filename) || $filename === '') {
        abort_request(404, 'Fichier introuvable.');
    }

    $assetPath = item_dir($itemId) . '/' . $filename;
    if (!is_file($assetPath)) {
        abort_request(404, 'Fichier introuvable.');
    }

    send_no_store_headers();
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string) filesize($assetPath));
    header('X-Content-Type-Options: nosniff');
    readfile($assetPath);
    exit;
});
