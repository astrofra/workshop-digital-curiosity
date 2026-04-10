<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

handle_api(function () {
    require_method('POST');

    $itemId = validate_item_id(query_string('id'));
    $entry = delete_item_or_404($itemId);

    json_response(200, [
        'message' => 'Objet supprime.',
        'item' => create_admin_item($entry),
    ]);
});
