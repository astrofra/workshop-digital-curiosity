<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

handle_api(function (): void {
    require_method('GET');

    $items = array_map(static fn(array $entry): array => create_public_item($entry), read_index());
    json_response(200, ['items' => $items]);
});
