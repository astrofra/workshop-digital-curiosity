<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

handle_api(function () {
    require_method('GET');

    $itemId = validate_item_id(query_string('id'));
    $entry = public_item_or_404($itemId);

    json_response(200, ['item' => create_public_item($entry)]);
});
