<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

handle_api(function () {
    require_method('GET');

    $items = array_map(static function (array $entry): array {
        return create_admin_item($entry);
    }, read_index());
    json_response(200, ['items' => $items]);
});
